/**
 * useActionCenter — React hook that aggregates unresolved actionable items
 * across the app and keeps a live count for the dashboard "Needs Attention"
 * card, the top-bar notification bell, and the PWA app badge.
 *
 * Subscriptions:
 *   - communication_logs   → unread_message, needs_reply, failed_send
 *   - formInstances        → unsigned_form, form_signed_confirmation
 *   - notifications        → already powered by useOperationsFeed; we
 *                            DO NOT duplicate that here. The bell shows
 *                            `unreadOpsFeed + unresolvedActionCount` so
 *                            both surfaces can coexist.
 *
 * Each underlying snapshot listener degrades safely: if a Firestore index
 * or collection is missing, that source contributes 0 items rather than
 * crashing the dashboard.
 *
 * The hook also pushes the unresolved count into `navigator.setAppBadge`
 * via {@link setAppBadge}, so installed PWAs get a numeric icon badge.
 */

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  ActionItem,
  ActionCenterSummary,
  buildItemFromCommunicationLog,
  buildItemFromFormInstance,
  summarize,
} from "../services/actionCenter";
import { setAppBadge } from "../lib/pwaBadge";

// Local cache key for client name lookups so the action center can render
// "John D." instead of "client abc123" without a join.
type ClientNameMap = Record<string, string>;

export function useActionCenter(): ActionCenterSummary & { loading: boolean } {
  const [commItems, setCommItems] = useState<ActionItem[]>([]);
  const [formItems, setFormItems] = useState<ActionItem[]>([]);
  const [clientNames, setClientNames] = useState<ClientNameMap>({});
  const [loading, setLoading] = useState(true);

  // 1) Load client names once for label rendering. Best-effort — failures
  //    just leave clientName undefined on items.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "customers"));
        if (cancelled) return;
        const map: ClientNameMap = {};
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          const name = [data?.firstName, data?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          if (name) map[d.id] = name;
        });
        setClientNames(map);
      } catch {
        // ignore — names are decorative
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Subscribe to communication_logs.
  useEffect(() => {
    let unsub = () => {};
    try {
      const q = query(
        collection(db, "communication_logs"),
        orderBy("createdAt", "desc"),
        limit(200)
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          const items: ActionItem[] = [];
          snap.docs.forEach((d) => {
            const data = d.data() as any;
            const item = buildItemFromCommunicationLog(
              d.id,
              data,
              data?.clientId ? clientNames[data.clientId] : undefined
            );
            if (item) items.push(item);
          });
          setCommItems(items);
          setLoading(false);
        },
        () => {
          // collection might not exist yet — fail silent
          setCommItems([]);
          setLoading(false);
        }
      );
    } catch {
      setCommItems([]);
      setLoading(false);
    }
    return () => unsub();
  }, [clientNames]);

  // 3) Subscribe to formInstances.
  useEffect(() => {
    let unsub = () => {};
    try {
      const q = query(
        collection(db, "formInstances"),
        orderBy("createdAt", "desc"),
        limit(200)
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          const items: ActionItem[] = [];
          snap.docs.forEach((d) => {
            const data = d.data() as any;
            const item = buildItemFromFormInstance(
              d.id,
              data,
              data?.clientId ? clientNames[data.clientId] : undefined
            );
            if (item) items.push(item);
          });
          setFormItems(items);
        },
        () => {
          setFormItems([]);
        }
      );
    } catch {
      setFormItems([]);
    }
    return () => unsub();
  }, [clientNames]);

  // 4) Aggregate + summarize.
  const summary = useMemo(() => {
    const all = [...commItems, ...formItems];
    return summarize(all);
  }, [commItems, formItems]);

  // 5) Push unresolved count into the OS PWA badge if available.
  useEffect(() => {
    setAppBadge(summary.unresolvedCount);
  }, [summary.unresolvedCount]);

  return { ...summary, loading };
}
