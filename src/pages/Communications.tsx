import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, getDocs, limit } from "firebase/firestore";
import { db } from "../firebase";
import { format } from "date-fns";
import { PageHeader } from "../components/PageHeader";
import { MessagesSquare, Search, Filter, AlertCircle, CheckCircle2, Clock, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Communications() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Record<string, any>>({});

  useEffect(() => {
    // Fetch customers first for name mapping
    const fetchCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, "customers"));
        const custs: Record<string, any> = {};
        snap.docs.forEach(d => {
          custs[d.id] = d.data();
        });
        setCustomers(custs);
      } catch (err) {
        console.error("Failed to fetch customers:", err);
      }
    };
    fetchCustomers();
  }, []);

  const fetchLogs = async (showToast = false) => {
    if (showToast) toast.loading("Syncing communications...", { id: "sync-comms" });
    try {
      const q = query(collection(db, "communication_logs"), orderBy("createdAt", "desc"), limit(100));
      const snapshot = await getDocs(q);
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(logsData);
      setLoading(false);
      if (showToast) toast.success("Communications Synchronized", { id: "sync-comms" });
    } catch (error: any) {
      console.error("Failed to fetch communication logs:", error);
      setLoading(false);
      if (showToast) toast.error("Sync Failed", { id: "sync-comms" });
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleRetry = async (logId: string, to: string, content: string) => {
    try {
      setRetryingId(logId);
      
      const res = await fetch("/api/messages/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body: content })
      });
      
      const data = await res.json();
      const isSuccess = data.success !== false && res.status === 200;
      
      let logStatus = isSuccess ? "sent" : "failed";
      let logDetail = isSuccess ? data.messageId : (data.error || "Unknown error");
      if (!isSuccess && data.code === 30034) {
        logDetail = "Twilio blocked this message because A2P 10DLC registration is incomplete. (" + logDetail + ")";
      }

      await updateDoc(doc(db, "communication_logs", logId), {
        status: logStatus,
        errorDetail: !isSuccess ? logDetail : "",
        messageId: isSuccess ? logDetail : "",
        updatedAt: serverTimestamp()
      });

      if (isSuccess) {
        toast.success("Message retry successful");
      } else {
        toast.error("Message retry failed: " + logDetail);
      }
    } catch (error: any) {
      toast.error("Retry failed: " + error.message);
      await updateDoc(doc(db, "communication_logs", logId), {
        status: "failed",
        errorDetail: error.message,
        updatedAt: serverTimestamp()
      });
    } finally {
      setRetryingId(null);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesType = typeFilter === "all" || log.type === typeFilter;
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    
    const customer = log.clientId && log.clientId !== "walk-in" ? customers[log.clientId] : null;
    const recipientName = customer ? `${customer.firstName || ""} ${customer.lastName || ""}` : "Unknown";
    
    const matchesSearch = 
      searchTerm === "" || 
      recipientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.recipient || "").includes(searchTerm) ||
      (log.content || "").toLowerCase().includes(searchTerm.toLowerCase());
      
    return matchesType && matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-none px-2 py-0.5"><CheckCircle2 className="w-3 h-3 mr-1" /> Sent</Badge>;
      case "failed":
        return <Badge className="bg-red-500/10 text-red-500 border-none px-2 py-0.5"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "skipped":
        return <Badge className="bg-gray-500/10 text-gray-500 border-none px-2 py-0.5"><Clock className="w-3 h-3 mr-1" /> Skipped</Badge>;
      default:
        return <Badge className="bg-blue-500/10 text-blue-500 border-none px-2 py-0.5">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none pt-4 px-8 pb-4 border-b border-white/5">
        <PageHeader 
          title="Communications" 
          subtitle="Message history and status"
        />

        <div className="flex items-center gap-4 mt-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input 
              placeholder="Search by client name, phone, or message..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border-white/10 pl-10 text-white placeholder:text-white/40 h-10 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] bg-black/40 border-white/10 text-white h-10 rounded-xl">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/5 text-white">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
              <SelectItem value="on_the_way">On The Way</SelectItem>
              <SelectItem value="started">Started</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="invoice_sent">Invoice Sent</SelectItem>
              <SelectItem value="payment_reminder">Payment Reminder</SelectItem>
              <SelectItem value="review_request">Review Request</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-black/40 border-white/10 text-white h-10 rounded-xl">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="bg-card border-white/5 text-white">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="bg-black/40 border-white/10 text-white hover:bg-white/5 rounded-xl h-10 px-4"
            onClick={() => fetchLogs(true)}
          >
            <RefreshCw className="w-4 h-4 mr-2 text-primary" />
            Sync
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <MessagesSquare className="w-8 h-8 text-white/40" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No Messages Found</h3>
            <p className="text-white/40 max-w-md">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLogs.map(log => {
              const customer = log.clientId && log.clientId !== "walk-in" ? customers[log.clientId] : null;
              const recipientName = customer ? `${customer.firstName || ""} ${customer.lastName || ""}` : "Unknown";
              const isExpanded = expandedId === log.id;

              return (
                <div key={log.id} className="bg-black/40 border border-white/5 outline outline-1 outline-white/5 rounded-2xl overflow-hidden transition-all duration-300">
                  <div 
                    className="p-4 flex items-center gap-6 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className="flex-1 grid grid-cols-5 gap-4 items-center">
                      <div className="col-span-1">
                        <p className="text-sm font-bold text-white truncate">{recipientName}</p>
                        <p className="text-[10px] text-white/50 truancate">{log.recipient}</p>
                      </div>
                      <div className="col-span-1">
                        <Badge className="bg-white/10 text-white hover:bg-white/20 border-none font-medium capitalize">
                          {log.type.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-white/60 truncate">{log.content}</p>
                      </div>
                      <div className="col-span-1 flex items-center justify-between">
                        {getStatusBadge(log.status)}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                            {log.createdAt ? format(log.createdAt.toDate(), "MMM d, yyyy h:mm a") : 'Pending'}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pl-4 border-l border-white/5 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-white/40" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-white/40" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-6 bg-white/5 border-t border-white/5 space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-primary">Message Body</label>
                        <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                          <p className="text-sm text-white/80 whitespace-pre-wrap">{log.content}</p>
                        </div>
                      </div>

                      {log.status === "failed" && log.errorDetail && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-red-500">Error Details</label>
                          <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 text-red-500 flex items-start gap-3">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="text-xs font-medium leading-relaxed">{log.errorDetail}</p>
                          </div>
                        </div>
                      )}

                      {log.status === "sent" && log.messageId && (
                        <div className="flex gap-4 items-center">
                           <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Message ID:</label>
                           <p className="text-xs font-mono text-white/60 bg-black/40 px-2 py-1 rounded">{log.messageId}</p>
                        </div>
                      )}

                      {log.status === "failed" && (
                        <div className="pt-2">
                          <Button 
                            onClick={(e) => { e.stopPropagation(); handleRetry(log.id, log.recipient, log.content); }}
                            disabled={retryingId === log.id}
                            className="bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-widest text-[10px] h-10 px-6 rounded-xl shadow-glow-blue transition-all hover:scale-105"
                          >
                            {retryingId === log.id ? (
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            Retry Message
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
