import { useState } from "react";
import { MessageSquare, Send, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { askAssistant } from "../services/gemini";
import Markdown from "react-markdown";

export default function AIAssistant({ 
  context, 
  isOpen: externalIsOpen, 
  onOpenChange 
}: { 
  context: any;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (val: boolean) => {
    if (onOpenChange) onOpenChange(val);
    setInternalIsOpen(val);
  };

  const [dynamicContext, setDynamicContext] = useState<any>(null);

  // Expose to window so other components can trigger it and pass context
  (window as any).openAIAssistant = (extra?: any) => {
    setIsOpen(true);
    if (extra) setDynamicContext(extra);
  };

  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Hello! I'm your DetailFlow AI Assistant. How can I help you optimize your detailing operations today?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Add debounce check
    const now = Date.now();
    const lastAIAction = Number(localStorage.getItem('last_chat_ai_action') || 0);
    if (now - lastAIAction < 2000) {
      toast.info("Please wait a moment between messages.");
      return;
    }
    localStorage.setItem('last_chat_ai_action', now.toString());

    const userMessage = { role: "user" as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const fullContext = { ...context, ...dynamicContext };
    try {
      console.log("[Chat Assistant] Request Sent");
      const response = await askAssistant(input, fullContext);
      const content = response?.suggestion || "I'm not sure how to respond to that.";
      setMessages(prev => [...prev, { role: "assistant", content }]);
    } catch (error: any) {
      console.error("AI Assistant Error:", error);
      let errorMessage = "I'm having trouble connecting to my brain right now. Please try again in a moment.";
      
      if (error.message?.includes("QUOTA_EXCEEDED")) {
        errorMessage = "My daily intelligence quota has been reached. Please check back tomorrow or contact support to upgrade.";
      } else if (error.message?.includes("high demand") || error.status === "UNAVAILABLE") {
        errorMessage = "I'm currently experiencing high demand. Please try again in a few seconds.";
      }
      
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: errorMessage 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-glow-blue bg-primary hover:bg-[#2A6CFF] z-50 flex items-center justify-center text-white transition-all hover:scale-110"
      >
        <MessageSquare className="w-6 h-6" />
      </Button>

      {/* Assistant Panel */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-[350px] sm:w-[400px] h-[500px] shadow-2xl z-50 flex flex-col border-none overflow-hidden animate-in slide-in-from-bottom-4 duration-300 rounded-2xl">
          <CardHeader className="bg-black text-white flex flex-row items-center justify-between py-4 border-b border-white/10">
            <CardTitle className="text-lg font-black flex items-center gap-2 uppercase tracking-tighter">
              <MessageSquare className="w-5 h-5 text-primary" />
              AI Assistant
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white hover:text-white hover:bg-white/10 h-8 w-8">
              <X className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm font-medium ${
                      msg.role === "user" 
                        ? "bg-primary text-white rounded-tr-none" 
                        : "bg-white/10 text-white rounded-tl-none border border-white/5"
                    }`}>
                      <div className="markdown-body">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/10 text-white rounded-2xl rounded-tl-none px-4 py-2 text-sm flex items-center gap-2 font-medium border border-white/5">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-white/5 bg-black/40">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                <Input 
                  placeholder="Ask anything..." 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-[#2A6CFF] text-white font-black shadow-glow-blue transition-all hover:scale-105">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
