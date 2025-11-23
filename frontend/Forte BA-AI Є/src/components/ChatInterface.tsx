import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
 
import { Switch } from "@/components/ui/switch";
import { Send, Sparkles, Download } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ChatMessage from "./ChatMessage";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/client";
import { marked } from "marked";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [publish, setPublish] = useState(false);
  const [docType, setDocType] = useState<string>("brd");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const getLastAssistantMessage = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content?.trim()) return messages[i].content;
    }
    return "";
  };

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
      const systemInstruction = (() => {
        switch (docType) {
          case "brd":
            return "Ты бизнес-аналитик. Сформируй документ бизнес-требований (BRD) в строгом Markdown: Заголовок, Цель, Описание, Scope, Заинтересованные стороны, Бизнес-правила, Нефункциональные требования, Ограничения, Риски, KPI. Возвращай только документ без лишнего текста.";
          case "use-case":
            return "Ты бизнес-аналитик. Сформируй Use Case документ: список акторов, перечень вариантов использования, детальные сценарии (основной/альтернативные потоки), предусловия/постусловия, исключения. Добавь диаграммы процессов: блок mermaid с ключевым потоком. Возвращай только документ.";
          case "user-stories":
            return "Ты бизнес-аналитик. Сформируй набор User Stories в виде EPIC -> Stories. Для каждой Story: формулировка, ценность, критерии приемки (GWT), приоритет. Возвращай только документ.";
          case "process":
            return "Ты бизнес-аналитик. Сформируй документ описания процесса: назначение, границы, роли, входы/выходы, шаги процесса (списком), бизнес-правила. Обязательно добавь блок кода mermaid с диаграммой процесса (flowchart). Возвращай только документ.";
          case "kpi":
            return "Ты бизнес-аналитик. Сформируй документ KPI/метрик: цели, карта метрик (определение, формула, периодичность, источники данных), пороги/алерты, визуализация (описание). Возвращай только документ.";
          default:
            return "Ты бизнес-аналитик. Сформируй комбинированный документ требований: основные разделы BRD, ключевые Use Case, 3–5 User Stories, шаги процесса (текст), KPI. Добавь блок mermaid для процесса. Возвращай только документ.";
        }
      })();
      const apiMessages = [
        { role: "system", content: systemInstruction },
        ...messages,
        { role: "user", content: userMessage },
      ];
      const { data, error } = await supabase.functions.invoke("ba-assistant", {
        body: { messages: apiMessages, options: { publish, domain: "ba", docType } }
      });
      if (error) throw error;
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
      if (publish) {
        if (data?.confluence?.published && data?.confluence?.url) {
          toast({ title: "Опубликовано в Confluence", description: String(data.confluence.url) });
        } else {
          toast({ title: "Публикация в Confluence не выполнена", description: String(data?.confluence?.error || "Проверьте параметры окружения"), variant: "destructive" });
        }
      }
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


  const handleDownload = () => {
    const content = getLastAssistantMessage();
    if (!content) {
      toast({ title: "Нет данных для скачивания", description: "Сначала получите ответ ассистента." });
      return;
    }
    const cleaned = content
      .split(/\r?\n/)
      .filter(l => !/^\s*(Пользователь|User|Assistant|Ассистент)\s*:/.test(l))
      .join("\n");

    const htmlBody = marked.parse(cleaned)
      .replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_m, code) => {
        const raw = String(code).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
        return `<div class="mermaid">${raw}</div>`
      });

    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BA Document</title>
  <style>
    body{font-family:system-ui,sans-serif;line-height:1.6;padding:24px;background:#fff;color:#111}
    h1,h2,h3{margin:1em 0 .5em}
    pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}
    code{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace}
    table{border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:6px}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function(){
      try {
        if (window.mermaid) {
          window.mermaid.initialize({startOnLoad:false, securityLevel:'loose'});
          var blocks = document.querySelectorAll('.mermaid');
          var idx = 0;
          blocks.forEach(function(el){
            var code = el.textContent || '';
            window.mermaid.render('m'+(idx++), code).then(function(res){
              var out = res.svg || res;
              if (typeof out === 'string' && out.indexOf('Syntax error in text') !== -1) {
                el.outerHTML = '<pre>'+ code.replace(/</g,'&lt;').replace(/>/g,'&gt;') +'</pre>';
              } else {
                el.innerHTML = out;
              }
            }).catch(function(){
              el.outerHTML = '<pre>'+ code.replace(/</g,'&lt;').replace(/>/g,'&gt;') +'</pre>';
            });
          });
        }
      } catch(e) {}
    });
  </script>
</head>
<body>
${htmlBody}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BA_Document_${new Date().toISOString().slice(0,19).replace(/[:T]/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
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
            <h3 className="text-xl font-semibold mb-2">Привет! Я Forte BA Assistant</h3>
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
          <div className="flex items-center gap-2">
            <span className="text-sm">Тип документа</span>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-full md:w-auto min-w-[220px]">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brd">Бизнес-требования (BRD)</SelectItem>
                <SelectItem value="use-case">Use Case</SelectItem>
                <SelectItem value="user-stories">User Stories</SelectItem>
                <SelectItem value="process">Процесс</SelectItem>
                <SelectItem value="kpi">KPI / Метрики</SelectItem>
                <SelectItem value="mixed">Комбинированный</SelectItem>
              </SelectContent>
            </Select>
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
          <Button
            onClick={handleDownload}
            disabled={isLoading}
            size="icon"
            variant="outline"
            className="h-[60px] w-[60px] shrink-0"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
