import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const [publish, setPublish] = useState(false);
  const [useLocal, setUseLocal] = useState(true);
  const [dialogueMode, setDialogueMode] = useState(false);
  const [dialogueStep, setDialogueStep] = useState(0);
  const [dialogueData, setDialogueData] = useState({
    title: "",
    description: "",
    actors: [] as string[],
    processSteps: [] as string[],
    functionalRequirements: [] as string[],
    nonFunctionalRequirements: [] as string[],
    acceptanceCriteria: [] as string[],
    successMetrics: [] as string[]
  });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [cfg, setCfg] = useState({ baseUrl: "", spaceKey: "", parentPageId: "", email: "", apiToken: "", title: "" });
  const [lastZip, setLastZip] = useState<{ base64: string; filename: string } | null>(null);
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
      if (supabase && !publish && !useLocal) {
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
          body: JSON.stringify({ inputFormat: "text", text: userMessage, options: { uploadToConfluence: publish, returnZip: true }, confluence: publish ? cfg : undefined })
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
        const pubInfo = publish ? (data?.confluence?.uploaded ? `\n\nОпубликовано в Confluence: ${data.confluence.url}` : data?.confluence?.error ? `\n\nОшибка публикации: ${data.confluence.error}` : "") : "";
        setMessages(prev => [...prev, { role: "assistant", content }]);
        if (pubInfo) setMessages(prev => [...prev, { role: "assistant", content: pubInfo }]);
        if (data?.zip) setLastZip(data.zip);
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

  const normalize = (s: string) => s.split(/[,;\n\|]/).map(x => x.trim()).filter(Boolean);

  const generateFromDialogue = async () => {
    const apiUrl = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000";
    setIsLoading(true);
    if (!startedAt) setStartedAt(Date.now());
    try {
      const resp = await fetch(`${apiUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputFormat: "json", data: dialogueData, options: { uploadToConfluence: publish, returnZip: true }, confluence: publish ? cfg : undefined })
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
      const pubInfo = publish ? (data?.confluence?.uploaded ? `\n\nОпубликовано в Confluence: ${data.confluence.url}` : data?.confluence?.error ? `\n\nОшибка публикации: ${data.confluence.error}` : "") : "";
      const finishedAt = Date.now();
      const ms = startedAt ? finishedAt - startedAt : 0;
      setMessages(prev => [...prev, { role: "assistant", content }]);
      if (pubInfo) setMessages(prev => [...prev, { role: "assistant", content: pubInfo }]);
      setMessages(prev => [...prev, { role: "assistant", content: `Время формирования: ${(ms/1000).toFixed(1)} сек.` }]);
      if (data?.missingFields?.length) {
        const names = data.missingFields.map((m: any) => m.field).join(", ");
        setMessages(prev => [...prev, { role: "assistant", content: `Недостающие поля: ${names}` }]);
        const toStep = (field: string) => {
          if (field === "title" || field === "description") return 0;
          if (field === "actors") return 1;
          if (field === "processSteps") return 2;
          if (field === "functionalRequirements" || field === "nonFunctionalRequirements") return 3;
          if (field === "acceptanceCriteria") return 4;
          if (field === "successMetrics") return 5;
          return 0;
        };
        setDialogueStep(toStep(data.missingFields[0].field));
      }
      if (data?.zip) setLastZip(data.zip);
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось сформировать артефакты", variant: "destructive" });
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
          <div className="flex items-center gap-2">
            <Switch checked={useLocal} onCheckedChange={setUseLocal} />
            <span className="text-sm">Использовать локальный генератор</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={dialogueMode} onCheckedChange={setDialogueMode} />
            <span className="text-sm">Режим диалога</span>
          </div>
        </div>
        {dialogueMode && (
          <div className="mb-4 space-y-3">
            {dialogueStep === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="dTitle" className="text-sm">Название</Label>
                  <Input id="dTitle" value={dialogueData.title} onChange={(e) => setDialogueData({ ...dialogueData, title: e.target.value })} placeholder="Напр.: Обработка заявок" />
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <Label htmlFor="dDesc" className="text-sm">Описание</Label>
                  <Textarea id="dDesc" value={dialogueData.description} onChange={(e) => setDialogueData({ ...dialogueData, description: e.target.value })} placeholder="Краткое описание" />
                </div>
              </div>
            )}
            {dialogueStep === 1 && (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="dActors" className="text-sm">Акторы</Label>
                  <Input id="dActors" onChange={(e) => setDialogueData({ ...dialogueData, actors: normalize(e.target.value) })} placeholder="Клиент, Оператор, Система" />
                </div>
              </div>
            )}
            {dialogueStep === 2 && (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="dSteps" className="text-sm">Шаги процесса</Label>
                  <Input id="dSteps" onChange={(e) => setDialogueData({ ...dialogueData, processSteps: normalize(e.target.value) })} placeholder="Получение, Проверка, Решение, Уведомление" />
                </div>
              </div>
            )}
            {dialogueStep === 3 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="dFr" className="text-sm">Функциональные требования</Label>
                  <Input id="dFr" onChange={(e) => setDialogueData({ ...dialogueData, functionalRequirements: normalize(e.target.value) })} placeholder="Регистрация, Валидация, Маршрутизация" />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="dNfr" className="text-sm">Нефункциональные требования</Label>
                  <Input id="dNfr" onChange={(e) => setDialogueData({ ...dialogueData, nonFunctionalRequirements: normalize(e.target.value) })} placeholder="Доступность 99.9%, Время ответа < 1с" />
                </div>
              </div>
            )}
            {dialogueStep === 4 && (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="dAc" className="text-sm">Критерии приемки</Label>
                  <Input id="dAc" onChange={(e) => setDialogueData({ ...dialogueData, acceptanceCriteria: normalize(e.target.value) })} placeholder="Все поля обязательные, Ошибки логируются" />
                </div>
              </div>
            )}
            {dialogueStep === 5 && (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="dKpi" className="text-sm">KPI</Label>
                  <Input id="dKpi" onChange={(e) => setDialogueData({ ...dialogueData, successMetrics: normalize(e.target.value) })} placeholder="Время обработки < 2 мин, Ошибок < 1%" />
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setDialogueStep(Math.max(0, dialogueStep - 1))}>Назад</Button>
              <Button type="button" variant="secondary" onClick={() => setDialogueStep(Math.min(5, dialogueStep + 1))}>Далее</Button>
              <Button type="button" onClick={generateFromDialogue} disabled={isLoading}>Сформировать</Button>
            </div>
          </div>
        )}
        {publish && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="baseUrl" className="text-sm">Base URL</Label>
              <Input id="baseUrl" value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} placeholder="https://your-domain.atlassian.net/wiki" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="spaceKey" className="text-sm">Space</Label>
              <Input id="spaceKey" value={cfg.spaceKey} onChange={(e) => setCfg({ ...cfg, spaceKey: e.target.value })} placeholder="SPACE" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="parentPageId" className="text-sm">Parent ID</Label>
              <Input id="parentPageId" value={cfg.parentPageId} onChange={(e) => setCfg({ ...cfg, parentPageId: e.target.value })} placeholder="опционально" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <Input id="email" value={cfg.email} onChange={(e) => setCfg({ ...cfg, email: e.target.value })} placeholder="user@company.com" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="token" className="text-sm">API Token</Label>
              <Input id="token" value={cfg.apiToken} onChange={(e) => setCfg({ ...cfg, apiToken: e.target.value })} placeholder="Atlassian API Token" type="password" />
            </div>
            <div className="flex items-center gap-2 md:col-span-3">
              <Label htmlFor="title" className="text-sm">Title</Label>
              <Input id="title" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} placeholder="Business Requirements" />
            </div>
          </div>
        )}
        {lastZip && (
          <div className="mb-4">
            <Button type="button" variant="secondary" onClick={() => {
              const b64 = lastZip.base64;
              const byteChars = atob(b64);
              const byteNumbers = new Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
              const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/zip" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = lastZip.filename || "artifacts.zip";
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}>Скачать ZIP</Button>
          </div>
        )}
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
