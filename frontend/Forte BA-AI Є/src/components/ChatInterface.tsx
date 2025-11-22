import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/client";
import ChatMessage from "./ChatMessage";
import { motion } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const apiUrl = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000";

    const userMessage = input.trim();
    setInput("");
    
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      if (supabase) {
        const { data, error } = await supabase.functions.invoke("ba-assistant", {
          body: { 
            messages: [...messages, { role: "user", content: userMessage }]
          }
        });
        if (error) throw error;
        setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
      } else {
        const resp = await fetch(`${apiUrl}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputFormat: "text", text: userMessage })
        });
        const data = await resp.json();
        if (!data?.ok) throw new Error(data?.error || "Ошибка генерации");
        const content = [
          data.artifacts?.businessRequirementsMd || "",
          data.artifacts?.useCasesMarkdown || "",
          data.artifacts?.userStoriesMarkdown || "",
          "Диаграмма (Mermaid):\n" + (data.artifacts?.processDiagramMermaid || ""),
          "Диаграмма (PlantUML):\n" + (data.artifacts?.processDiagramPlantUML || ""),
          data.artifacts?.kpiMarkdown || ""
        ].filter(Boolean).join("\n\n");
        setMessages(prev => [...prev, { role: "assistant", content }]);
      }
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось получить ответ. Проверьте соединение или данные.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center mb-4 shadow-glow">
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Привет! Я Fort BA Assistant</h3>
            <p className="text-muted-foreground max-w-md">
              Я помогу вам собрать и структурировать бизнес-требования, 
              создать аналитические артефакты и документацию.
            </p>
          </motion.div>
        ) : (
          <>
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                role={message.role}
                content={message.content}
              />
            ))}
            {isLoading && (
              <ChatMessage
                role="assistant"
                content=""
                isThinking
              />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-card px-6 py-4">
        <div className="flex gap-3 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Опишите вашу задачу или вопрос..."
            className="min-h-[60px] max-h-[200px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[60px] w-[60px] shrink-0 shadow-lg hover:shadow-glow transition-all"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
