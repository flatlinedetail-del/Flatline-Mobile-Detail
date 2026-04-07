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

  // Expose to window so other components can trigger it
  (window as any).openAIAssistant = () => setIsOpen(true);
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

    const response = await askAssistant(input, context);
    const content = response?.suggestion || "I'm not sure how to respond to that.";
    setMessages(prev => [...prev, { role: "assistant", content }]);
    setIsLoading(false);
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-xl bg-blue-600 hover:bg-blue-700 z-50"
      >
        <MessageSquare className="w-6 h-6" />
      </Button>

      {/* Assistant Panel */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-[350px] sm:w-[400px] h-[500px] shadow-2xl z-50 flex flex-col border-none overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <CardHeader className="bg-blue-600 text-white flex flex-row items-center justify-between py-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              AI Assistant
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white hover:bg-white/10 h-8 w-8">
              <X className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === "user" 
                        ? "bg-blue-600 text-white rounded-tr-none" 
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
                    <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-none px-4 py-2 text-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
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
                <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
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
