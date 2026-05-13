import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import type { Client } from "../types";
import { toFieldClient, type FieldClient } from "../services/fieldClient";

/**
 * Live clients hook for phone Field Mode.
 *
 * Subscribes to the SAME `clients` Firestore collection used by the
 * desktop Clients page. Mirrors the desktop's default query
 * (`orderBy("createdAt", "desc")`, `limit(50)`) — no duplicate store,
 * no schema divergence.
 *
 * Returns slim FieldClient records (call/text/email URLs pre-built).
 */
export interface UseClientsLiveResult {
  clients: FieldClient[];
  loading: boolean;
  error: string | null;
}

export function useClientsLive(pageSize = 50): UseClientsLiveResult {
  const [clients, setClients] = useState<FieldClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(pageSize));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: FieldClient[] = [];
        snap.forEach((docSnap) => {
          const data = { id: docSnap.id, ...(docSnap.data() as object) } as Client;
          next.push(toFieldClient(data));
        });
        setClients(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[useClientsLive] snapshot error", err);
        setError(err?.message || "Failed to load clients");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [pageSize]);

  return { clients, loading, error };
}
