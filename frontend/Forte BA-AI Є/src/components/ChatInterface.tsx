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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import html2pdf from "html2pdf.js";
import { Packer, Document, Paragraph, HeadingLevel, TextRun } from "docx";
import * as XLSX from "xlsx";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [publish, setPublish] = useState(false);
  const [fileFormat, setFileFormat] = useState<string>("html");
  const [confBaseUrl, setConfBaseUrl] = useState("");
  const [confSpaceKey, setConfSpaceKey] = useState("");
  const [confParentId, setConfParentId] = useState("");
  const [confEmail, setConfEmail] = useState("");
  const [confToken, setConfToken] = useState("");
  const [confTitle, setConfTitle] = useState("");
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
      const systemInstruction = "Ты бизнес-аналитик. Всегда возвращай полноценный самодостаточный документ требований в строгом Markdown: Заголовок, Цель, Описание, Scope, Заинтересованные стороны, Бизнес-правила, Use Case, User Stories, Процесс (текстовое описание), KPI. Добавляй диаграммы: блок кода mermaid для процесса и блок кода plantuml. Возвращай только документ без лишнего текста.";
      const apiMessages = [
        { role: "system", content: systemInstruction },
        ...messages,
        { role: "user", content: userMessage },
      ];
      const { data, error } = await supabase.functions.invoke("ba-assistant", {
        body: { messages: apiMessages, options: { publish, domain: "ba", fileFormat, confluence: { baseUrl: confBaseUrl, spaceKey: confSpaceKey, parentPageId: confParentId, email: confEmail, apiToken: confToken, title: confTitle } } }
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
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
    if (fileFormat === "html") {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BA_Document_${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    if (fileFormat === "docx") {
      const parseSections = (md: string) => {
        const lines = md.split(/\r?\n/);
        const sections: { name: string; content: string[] }[] = [];
        let current: { name: string; content: string[] } | null = null;
        for (const line of lines) {
          const m = line.match(/^\s{0,3}(#+)\s+(.*)$/);
          if (m) {
            if (current) sections.push(current);
            current = { name: m[2].trim(), content: [] };
          } else {
            if (!current) current = { name: "Документ", content: [] };
            current.content.push(line);
          }
        }
        if (current) sections.push(current);
        return sections.map(s => [s.name, s.content.join("\n").trim()]);
      };
      const sections = parseSections(cleaned);
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: sections.flatMap(([title, body]) => {
              const paras: Paragraph[] = [];
              paras.push(new Paragraph({ text: String(title), heading: HeadingLevel.HEADING_2 }));
              body.split(/\n\n+/).forEach(block => {
                paras.push(new Paragraph({ children: [new TextRun({ text: block })] }));
              });
              return paras;
            }),
          },
        ],
      });
      Packer.toBlob(doc).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `BA_Document_${stamp}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }).catch(() => {
        toast({ title: "Ошибка", description: "Не удалось создать DOCX", variant: "destructive" });
      });
      return;
    }
    if (fileFormat === "pdf") {
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.width = "800px";
      container.innerHTML = htmlBody;
      document.body.appendChild(container);
      const renderMermaid = async () => {
        try {
          const w: any = window as any;
          if (w.mermaid) {
            w.mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
            const blocks = container.querySelectorAll('.mermaid');
            let idx = 0;
            for (const el of Array.from(blocks)) {
              const code = (el.textContent || '') as string;
              try {
                const res = await w.mermaid.render('pdf_m' + (idx++), code);
                const out = (res as any).svg || res;
                if (typeof out === 'string' && out.includes('Syntax error in text')) {
                  (el as HTMLElement).outerHTML = '<pre>' + code.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>';
                } else {
                  (el as HTMLElement).innerHTML = out as string;
                }
              } catch {
                (el as HTMLElement).outerHTML = '<pre>' + code.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>';
              }
            }
          }
        } catch {}
      };
      renderMermaid().then(() => {
        try {
          (html2pdf as any)().from(container).set({ margin: 10, filename: `BA_Document_${stamp}.pdf`, html2canvas: { scale: 2 } }).save();
        } catch (e) {
          toast({ title: "Ошибка", description: "Не удалось создать PDF", variant: "destructive" });
        } finally {
          document.body.removeChild(container);
        }
      });
      return;
    }
    if (fileFormat === "xlsx") {
      try {
        const parseSections = (md: string) => {
          const lines = md.split(/\r?\n/);
          const sections: { name: string; content: string[] }[] = [];
          let current: { name: string; content: string[] } | null = null;
          for (const line of lines) {
            const m = line.match(/^\s{0,3}(#+)\s+(.*)$/);
            if (m) {
              if (current) sections.push(current);
              current = { name: m[2].trim(), content: [] };
            } else {
              if (!current) current = { name: "Документ", content: [] };
              current.content.push(line);
            }
          }
          if (current) sections.push(current);
          return sections.map(s => [s.name, s.content.join("\n").trim()]);
        };
        const rows = [["Раздел", "Содержание"], ...parseSections(cleaned)];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{ wch: 30 }, { wch: 100 }];
        XLSX.utils.book_append_sheet(wb, ws, "Документ");
        const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `BA_Document_${stamp}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        toast({ title: "Ошибка", description: "Не удалось создать Excel", variant: "destructive" });
      }
      return;
    }
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Switch checked={publish} onCheckedChange={setPublish} />
            <span className="text-sm">Публиковать в Confluence</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">Формат файла</span>
            <Select value={fileFormat} onValueChange={setFileFormat}>
              <SelectTrigger className="w-full md:w-auto min-w-[220px]">
                <SelectValue placeholder="Выберите формат" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="docx">Word (.docx)</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {publish && (
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3 border border-border rounded-md p-3">
              <div className="space-y-1">
                <Label>Confluence Base URL</Label>
                <Input value={confBaseUrl} onChange={(e)=>setConfBaseUrl(e.target.value)} placeholder="https://your-domain.atlassian.net/wiki" />
              </div>
              <div className="space-y-1">
                <Label>Space Key</Label>
                <Input value={confSpaceKey} onChange={(e)=>setConfSpaceKey(e.target.value)} placeholder="SPACE" />
              </div>
              <div className="space-y-1">
                <Label>Parent Page ID</Label>
                <Input value={confParentId} onChange={(e)=>setConfParentId(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={confEmail} onChange={(e)=>setConfEmail(e.target.value)} placeholder="user@domain.com" />
              </div>
              <div className="space-y-1">
                <Label>API Token</Label>
                <Input value={confToken} onChange={(e)=>setConfToken(e.target.value)} placeholder="Atlassian API Token" type="password" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Page Title</Label>
                <Input value={confTitle} onChange={(e)=>setConfTitle(e.target.value)} placeholder="Заголовок страницы" />
              </div>
            </div>
          )}
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
