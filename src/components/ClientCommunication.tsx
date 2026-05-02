import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Client, CommunicationLog } from "../types";
import { format } from "date-fns";
import { Send, Phone, Mail, MessageSquare, History, Plus, AlertCircle, Loader2, CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { messagingService } from "../services/messagingService";

interface ClientCommunicationProps {
  client: Client;
}

export function ClientCommunication({ client }: ClientCommunicationProps) {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("history");
  
  // Form State
  const [type, setType] = useState<"sms" | "email" | "note">("email");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!client.id) return;

    const q = query(
      collection(db, "communication_logs"),
      where("clientId", "==", client.id),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CommunicationLog[]);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to communication logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [client.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSending(true);
    try {
      let deliveryStatus = "sent";

      if (type === "email") {
        if (!client.email) throw new Error("Client has no email address configured.");
        await messagingService.sendEmail({
          to: client.email,
          subject: subject || "Message from our team",
          text: content
        });
        deliveryStatus = "delivered";
      } else if (type === "sms") {
        if (!client.phone) throw new Error("Client has no phone number configured.");
        const res = await messagingService.sendSms({
          to: client.phone,
          body: content
        });
        deliveryStatus = res.status || "delivered";
      }

      const logData = {
        clientId: client.id,
        type,
        content,
        subject: type === "email" ? subject : undefined,
        senderId: profile?.id || null,
        senderName: profile?.displayName || null,
        status: deliveryStatus,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "communication_logs"), logData);
      
      // Reset form
      setContent("");
      setSubject("");
      setActiveTab("history");
      toast.success(`${type.toUpperCase()} sent and logged successfully`);
    } catch (error: any) {
       console.error("Error logging communication:", error);
       
       // Log failure if it was a message attempt
       if (type !== "note") {
        await addDoc(collection(db, "communication_logs"), {
          clientId: client.id,
          type,
          content,
          subject: type === "email" ? subject : undefined,
          senderId: profile?.id || null,
          senderName: profile?.displayName || null,
          status: "failed",
          errorDetail: error.message || "Sending failed",
          createdAt: serverTimestamp()
        });
       }
       
       toast.error(error.message || `Failed to send ${type === 'note' ? 'note' : type.toUpperCase()}`);
    } finally {
      setIsSending(false);
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case "sms": return <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />;
      case "email": return <Mail className="w-3.5 h-3.5 text-[#0A4DFF]" />;
      case "note": return <Plus className="w-3.5 h-3.5 text-amber-500" />;
      case "alert": return <AlertCircle className="w-3.5 h-3.5 text-primary outline-dashed scale-110" />;
      default: return <History className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-black/40 p-1 rounded-xl h-12">
          <TabsTrigger 
            value="history" 
            className="rounded-lg font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white"
          >
            Communication Log
          </TabsTrigger>
          <TabsTrigger 
            value="new" 
            className="rounded-lg font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white"
          >
            Direct Outreach
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6 space-y-4">
          <Card className="border-none bg-black/40 shadow-inner overflow-hidden">
             <CardContent className="p-0">
               <ScrollArea className="h-[400px]">
                 {loading ? (
                   <div className="flex flex-col items-center justify-center h-full p-12 space-y-4">
                     <Loader2 className="w-8 h-8 text-primary animate-spin" />
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Retrieving Comms Stream...</p>
                   </div>
                 ) : logs.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                     <History className="w-12 h-12 text-zinc-800 mb-4" />
                     <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest leading-relaxed"> No communication history recorded for this target profile.</p>
                   </div>
                 ) : (
                   <div className="divide-y divide-white/5">
                     {logs.map((log) => (
                       <div key={log.id} className="p-4 hover:bg-white/5 transition-all group">
                         <div className="flex gap-4">
                           <div className="w-8 h-8 rounded-lg bg-black border border-white/10 flex items-center justify-center shrink-0">
                             {getLogIcon(log.type)}
                           </div>
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center justify-between mb-1">
                               <div className="flex items-center gap-2">
                                 <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest border-white/10 bg-white/5">
                                   {log.type}
                                 </Badge>
                                 <span className="text-[10px] text-zinc-500 font-bold">
                                   via {log.senderName || "System"}
                                 </span>
                               </div>
                               <div className="flex items-center gap-2">
                                 <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/5 bg-black text-zinc-400">
                                   {log.status || 'unknown'}
                                 </span>
                                 <span className="text-[9px] text-zinc-600 font-bold whitespace-nowrap">
                                   {log.createdAt ? format((log.createdAt as any).toDate(), "MMM d, h:mm a") : 'Pending...'}
                                 </span>
                               </div>
                             </div>
                             {log.subject && (
                               <p className="text-xs font-black text-white uppercase tracking-tight mb-1">{log.subject}</p>
                             )}
                             <p className="text-xs text-zinc-400 break-words leading-relaxed whitespace-pre-wrap">
                               {log.content}
                             </p>
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </ScrollArea>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new" className="mt-6">
          <Card className="border-none bg-black/40 shadow-inner">
            <form onSubmit={handleSendMessage}>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Outreach Mode</Label>
                    <Select value={type} onValueChange={(v: any) => setType(v)}>
                      <SelectTrigger className="bg-black border border-white/10 text-white rounded-xl h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-white/10 text-white">
                        <SelectItem value="email">Electronic Mail (Email)</SelectItem>
                        <SelectItem value="sms">Short Message Service (SMS)</SelectItem>
                        <SelectItem value="note">Internal Liaison Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {type === "email" && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Subject Header</Label>
                      <Input 
                        placeholder="Action Required: Tactical Update"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="bg-black border border-white/10 text-white rounded-xl h-12"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Intelligence Data / Message Content</Label>
                  <Textarea 
                    placeholder={type === "note" ? "Enter internal intelligence details..." : "Construct outreach payload..."}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="bg-black border border-white/10 text-white rounded-2xl min-h-[150px] resize-none focus:ring-primary/20"
                  />
                </div>

                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white">Tactical Routing Enabled</p>
                    <p className="text-xs text-white/50 font-medium">
                      {type === "email" ? `Transmitting via secure SMTP to ${client.email}` : 
                       type === "sms" ? `Transmitting via cellular gateway to ${client.phone}` : 
                       "Recording internal memorandum."}
                    </p>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={isSending || !content.trim()}
                  className="w-full h-14 bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl shadow-glow-blue transition-all hover:scale-[1.01]"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                      Transmitting Protocol...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-3" />
                      Execute Transmission
                    </>
                  )}
                </Button>
              </CardContent>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sub-components as needed or helper Label
const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <label className={cn("inline-block", className)}>{children}</label>
);
