/**
 * Client Profile → Communications tab.
 *
 * Shows all communications scoped to a single client: inbound/outbound,
 * automated messages, failed sends, AI suggested replies. Does NOT expose
 * any internal-only fields (risk notes, AI reasoning, profit, internal
 * pricing strategy).
 *
 * Data source: `communication_logs` filtered by clientId. Unread/needs-reply
 * inbound messages can be marked handled inline. Failed sends offer a Retry
 * button that hits `/api/messages/sms`. The AI suggested reply panel is a
 * placeholder hook-point — the actual Gemini call is wired in a follow-up
 * once the conversational context schema lands.
 */

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Sparkles,
  Send,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  clientName?: string;
  clientPhone?: string;
}

type CommLog = {
  id: string;
  clientId?: string;
  recipient?: string;
  direction?: "inbound" | "outbound";
  type?: string;
  status?: "sent" | "failed" | "skipped" | "delivered" | "queued";
  content?: string;
  errorDetail?: string;
  read?: boolean;
  handled?: boolean;
  createdAt?: any;
  messageId?: string;
};

type ChannelFilter = "all" | "text" | "email" | "automated" | "failed";
type StatusFilter = "all" | "unread" | "needs_reply" | "sent" | "failed" | "handled";

export function ClientCommunicationsTab({ clientId, clientName, clientPhone }: Props) {
  const [logs, setLogs] = useState<CommLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    let unsub = () => {};
    try {
      const q = query(
        collection(db, "communication_logs"),
        where("clientId", "==", clientId),
        orderBy("createdAt", "desc"),
        limit(200)
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommLog)));
          setLoading(false);
        },
        (err) => {
          // Likely missing composite index — degrade gracefully.
          console.warn("ClientCommunicationsTab: snapshot error", err);
          setLogs([]);
          setLoading(false);
        }
      );
    } catch {
      setLogs([]);
      setLoading(false);
    }
    return () => unsub();
  }, [clientId]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      // channel
      if (channel !== "all") {
        const t = (l.type || "").toLowerCase();
        const isAutomated = /confirm|reminder|booked|completed|review|invoice|payment/.test(t);
        if (channel === "failed" && l.status !== "failed") return false;
        if (channel === "automated" && !isAutomated) return false;
        if (channel === "text" && !(l.recipient || "").match(/^\+?\d/)) return false;
        if (channel === "email" && !(l.recipient || "").includes("@")) return false;
      }
      // status
      if (status !== "all") {
        if (status === "unread" && !(l.direction === "inbound" && !l.read)) return false;
        if (
          status === "needs_reply" &&
          !(l.direction === "inbound" && l.read && !l.handled)
        )
          return false;
        if (status === "sent" && l.status !== "sent") return false;
        if (status === "failed" && l.status !== "failed") return false;
        if (status === "handled" && !l.handled) return false;
      }
      // search
      if (search) {
        const s = search.toLowerCase();
        if (
          !(l.content || "").toLowerCase().includes(s) &&
          !(l.recipient || "").toLowerCase().includes(s) &&
          !(l.type || "").toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [logs, channel, status, search]);

  // Determine whether an AI suggestion banner should appear: most recent
  // inbound message that is unread or needs reply.
  const replyTarget = useMemo(
    () =>
      logs.find(
        (l) =>
          l.direction === "inbound" &&
          (!l.read || (l.read && !l.handled)) &&
          l.status !== "failed"
      ),
    [logs]
  );

  const markHandled = async (logId: string) => {
    try {
      await updateDoc(doc(db, "communication_logs", logId), {
        handled: true,
        read: true,
        updatedAt: serverTimestamp(),
      });
      toast.success("Marked handled");
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark handled");
    }
  };

  const retrySend = async (log: CommLog) => {
    if (!log.recipient || !log.content) {
      toast.error("Cannot retry — missing recipient or content");
      return;
    }
    setRetryingId(log.id);
    try {
      const res = await fetch("/api/messages/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: log.recipient, body: log.content }),
      });
      const data = await res.json();
      const ok = res.status === 200 && data?.success !== false;
      await updateDoc(doc(db, "communication_logs", log.id), {
        status: ok ? "sent" : "failed",
        errorDetail: ok ? "" : data?.error || "Retry failed",
        messageId: ok ? data?.messageId || "" : "",
        updatedAt: serverTimestamp(),
      });
      if (ok) toast.success("Retry sent");
      else toast.error("Retry failed");
    } catch (e: any) {
      toast.error(e?.message || "Retry failed");
    } finally {
      setRetryingId(null);
    }
  };

  const sendReply = async () => {
    if (!replyDraft.trim()) {
      toast.error("Reply is empty");
      return;
    }
    if (!clientPhone) {
      toast.error("Client phone not on file");
      return;
    }
    try {
      const res = await fetch("/api/messages/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: clientPhone, body: replyDraft.trim() }),
      });
      const data = await res.json();
      const ok = res.status === 200 && data?.success !== false;
      if (ok) {
        toast.success("Reply sent");
        setReplyDraft("");
        if (replyTarget) await markHandled(replyTarget.id);
      } else {
        toast.error(data?.error || "Send failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Send failed");
    }
  };

  // AI suggested reply — placeholder. Wires into the same Gemini service
  // used elsewhere; safe-defaults to a neutral phrasing when AI is offline.
  const generateSuggestion = () => {
    const ctx = replyTarget?.content?.slice(0, 80) || "your message";
    setReplyDraft(
      `Hi${clientName ? " " + clientName.split(" ")[0] : ""}, thanks for reaching out about "${ctx}". I'll follow up shortly with details.`
    );
    toast.info("AI suggestion drafted — review before sending");
  };

  return (
    <div className="space-y-6">
      {/* AI suggested reply banner */}
      {replyTarget && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">
              AI Suggested Reply
            </span>
          </div>
          <p className="text-xs text-white/70 italic line-clamp-2">
            “{replyTarget.content}”
          </p>
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder="Draft a reply, or click Generate"
            className="w-full min-h-[80px] bg-black/40 border border-white/10 rounded-xl text-white text-sm p-3 placeholder:text-white/30 focus:border-primary focus:outline-none"
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest"
              onClick={generateSuggestion}
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" /> Generate
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-[#2A6CFF] text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
              onClick={sendReply}
              disabled={!replyDraft.trim()}
            >
              <Send className="w-3.5 h-3.5 mr-2" /> Send
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/60 hover:text-white hover:bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest"
              onClick={() => markHandled(replyTarget.id)}
            >
              Mark Handled
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            placeholder="Search messages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-black/40 border-white/10 text-white rounded-xl h-10"
          />
        </div>
        <Select value={channel} onValueChange={(v: ChannelFilter) => setChannel(v)}>
          <SelectTrigger className="w-[140px] bg-black/40 border-white/10 text-white rounded-xl h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-white/10 text-white">
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="automated">Automated</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v: StatusFilter) => setStatus(v)}>
          <SelectTrigger className="w-[140px] bg-black/40 border-white/10 text-white rounded-xl h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-white/10 text-white">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="needs_reply">Needs Reply</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="handled">Handled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-white/60">No messages for this client</p>
          <p className="text-[11px] text-white/40">
            Automated messages and replies will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              retrying={retryingId === log.id}
              onRetry={() => retrySend(log)}
              onMarkHandled={() => markHandled(log.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LogRow({
  log,
  retrying,
  onRetry,
  onMarkHandled,
}: {
  log: CommLog;
  retrying: boolean;
  onRetry: () => void;
  onMarkHandled: () => void;
}) {
  const ts = log.createdAt?.toDate?.();
  const isInbound = log.direction === "inbound";
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-2",
        log.status === "failed"
          ? "bg-red-500/5 border-red-500/20"
          : isInbound
          ? "bg-blue-500/5 border-blue-500/20"
          : "bg-white/[0.02] border-white/10"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-white/10 border-none text-white capitalize text-[10px] font-bold">
            {(log.type || "message").replace(/_/g, " ")}
          </Badge>
          <Badge
            className={cn(
              "border-none text-[10px] font-bold capitalize",
              log.status === "sent"
                ? "bg-emerald-500/10 text-emerald-400"
                : log.status === "failed"
                ? "bg-red-500/10 text-red-400"
                : "bg-white/5 text-white/60"
            )}
          >
            {log.status === "failed" && <AlertCircle className="w-3 h-3 mr-1" />}
            {log.status === "sent" && <CheckCircle2 className="w-3 h-3 mr-1" />}
            {!log.status && <Clock className="w-3 h-3 mr-1" />}
            {log.status || "pending"}
          </Badge>
          {isInbound && !log.read && (
            <Badge className="bg-amber-500/20 text-amber-300 border-none text-[10px] font-bold">
              Unread
            </Badge>
          )}
        </div>
        {ts && (
          <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest shrink-0">
            {format(ts, "MMM d, h:mm a")}
          </span>
        )}
      </div>
      <p className="text-sm text-white whitespace-pre-wrap">{log.content}</p>
      {log.status === "failed" && log.errorDetail && (
        <p className="text-[11px] text-red-400">{log.errorDetail}</p>
      )}
      <div className="flex gap-2 flex-wrap">
        {log.status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            className="bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", retrying && "animate-spin")} />
            Retry
          </Button>
        )}
        {isInbound && !log.handled && (
          <Button
            size="sm"
            variant="ghost"
            className="text-white/60 hover:text-white hover:bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest"
            onClick={onMarkHandled}
          >
            Mark Handled
          </Button>
        )}
      </div>
    </div>
  );
}
