import { useState } from "react";
import { MessageSquare, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { askAssistant } from "../services/gemini";
import Markdown from "react-markdown";

export default function AIAssistant({ context }: { context: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dynamicContext, setDynamicContext] = useState<any>(null);

  // Expose to window so other components can trigger it and pass context
  (window as any).openAIAssistant = (extra?: any) => {
    setIsOpen(true);
    if (extra) setDynamicContext(extra);
  };

  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Hello! I'm your Flatline AI Assistant. How can I help you with your detailing business today?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user" as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const fullContext = { ...context, ...dynamicContext };
    const response = await askAssistant(input, fullContext);
    const content = response?.suggestion || "I'm not sure how to respond to that.";
    setMessages(prev => [...prev, { role: "assistant", content }]);
    setIsLoading(false);
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-xl bg-primary hover:bg-red-700 z-50"
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
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white hover:bg-white/10 h-8 w-8">
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
                        : "bg-gray-100 text-gray-800 rounded-tl-none"
                    }`}>
                      <div className="markdown-body">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-none px-4 py-2 text-sm flex items-center gap-2 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                <Input 
                  placeholder="Ask anything..." 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)}
                  className="bg-white border-gray-200"
                />
                <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-red-700">
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
