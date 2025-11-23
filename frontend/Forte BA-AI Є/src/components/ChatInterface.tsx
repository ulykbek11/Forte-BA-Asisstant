import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
 
import { Switch } from "@/components/ui/switch";
import { Send, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ChatMessage from "./ChatMessage";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [publish, setPublish] = useState(false);
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

    const userMessage = input.trim();
    setInput("");
    
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      if (!supabase) throw new Error("Supabase не сконфигурирован");
      const systemInstruction =
        "Ты бизнес-аналитик. Отвечай только по задачам бизнес-аналитики: сбор и анализ требований, артефакты, документация, процессы и методологии. На вопросы вне этой области вежливо отказывай, кратко объясняй фокус и предлагай релевантные BA шаги.";
      const apiMessages = [
        { role: "system", content: systemInstruction },
        ...messages,
        { role: "user", content: userMessage },
      ];
      const { data, error } = await supabase.functions.invoke("ba-assistant", {
        body: { messages: apiMessages, options: { publish, domain: "ba" } }
      });
      if (error) throw error;
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось получить ответ. Проверьте Supabase настройки.",
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Switch checked={publish} onCheckedChange={setPublish} />
            <span className="text-sm">Публиковать в Confluence</span>
          </div>
        </div>
        
        
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
