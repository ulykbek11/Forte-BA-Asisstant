import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useEffect, useState } from "react";
import mermaid from "mermaid";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isThinking?: boolean;
  attachments?: { type: "docx" | "pdf" | "html" | "xlsx"; name: string; url: string }[];
}

const ChatMessage = ({ role, content, isThinking, attachments }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex gap-3 mb-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-md">
          <Bot className="w-5 h-5 text-primary-foreground" />
        </div>
      )}
      
      <div
        className={cn(
          "max-w-full sm:max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-md transition-all",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border"
        )}
      >
        {isThinking ? (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <motion.div
                className="w-2 h-2 rounded-full bg-ai-thinking"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
              />
              <motion.div
                className="w-2 h-2 rounded-full bg-ai-thinking"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className="w-2 h-2 rounded-full bg-ai-thinking"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
              />
            </div>
            <span className="text-sm text-muted-foreground">Анализирую...</span>
          </div>
        ) : (
          <div className={cn("text-sm leading-relaxed whitespace-pre-wrap")}> 
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                a: ({node, ...props}) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary-hover" />
                ),
                code: ({inline, className, children, ...props}) => {
                  const code = String(children || "");
                  if (!inline && /language-mermaid/.test(className || "")) {
                    if (/^\s*linechart\b/i.test(code)) {
                      return <MermaidLinechartFallback code={code} />;
                    }
                    return <MermaidBlock code={code} />;
                  }
                  if (!inline) {
                    const m = /language-(\w+)/.exec(className || "");
                    const lang = (m?.[1] || "").toLowerCase();
                    const looksMarkdown = !lang || lang === "md" || lang === "markdown" || /(^|\n)#{1,6}\s/.test(code) || /(^|\n)\|.*\|/.test(code);
                    if (looksMarkdown) {
                      return (
                        <div className="my-2">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}> 
                            {code}
                          </ReactMarkdown>
                        </div>
                      );
                    }
                  }
                  return inline ? (
                    <code className={cn("px-1 py-0.5 rounded bg-muted text-foreground", className)} {...props}>{children}</code>
                  ) : (
                    <pre className="overflow-x-auto p-3 rounded bg-muted">
                      <code className={className} {...props}>{children}</code>
                    </pre>
                  );
                },
                ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/40 pl-3 italic" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-lg font-semibold" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-base font-semibold" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-sm font-semibold" {...props} />,
                table: ({node, ...props}) => <div className="overflow-x-auto"><table className="min-w-full text-sm" {...props} /></div>,
                th: ({node, ...props}) => <th className="border border-border px-2 py-1 bg-muted" {...props} />,
                td: ({node, ...props}) => <td className="border border-border px-2 py-1" {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
            {!isUser && Array.isArray(attachments) && attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <a key={i} href={a.url} download={a.name} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs hover:bg-muted" target="_blank" rel="noopener noreferrer">
                    {a.type.toUpperCase()} · {a.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shadow-md">
          <User className="w-5 h-5 text-secondary-foreground" />
        </div>
      )}
    </motion.div>
  );
};

export default ChatMessage;
const MermaidBlock = ({ code }: { code: string }) => {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  useEffect(() => {
    const renderDiagram = async () => {
      try {
        // Инициализируем mermaid с настройками для лучшей совместимости
        mermaid.initialize({ 
          startOnLoad: false, 
          securityLevel: "loose",
          theme: 'default',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis'
          },
          // Добавляем настройки для совместимости с версией 11.12.1
          fontFamily: 'monospace',
          fontSize: '14px'
        });
        
        const id = "mermaid-" + Math.random().toString(36).slice(2);
        const trimmedCode0 = code
          .split(/\r?\n/)
          .filter(l => !/^\s*mermaid\s+version\b/i.test(l))
          .join("\n")
          .replace(/\bmermaid\s+version\b.*$/gmi, "")
          .trim();
        let trimmedCode = trimmedCode0;
        if (/^\s*pie\b/i.test(trimmedCode)) {
          trimmedCode = trimmedCode.replace(/:\s*(-?\d+(?:[.,]\d+)?)\s*%/g, (_m, num) => `: ${String(num).replace(/,/g, '.')}`);
        }
        
        // Проверяем базовый синтаксис mermaid
        if (!trimmedCode || trimmedCode.length < 5) {
          throw new Error("Пустая или слишком короткая диаграмма");
        }
        
        // Проверяем наличие ключевых слов для различных типов диаграмм
        const validDiagramTypes = ['flowchart', 'sequence', 'class', 'state', 'er', 'journey', 'gantt', 'pie'];
        const hasValidType = validDiagramTypes.some(type => trimmedCode.toLowerCase().startsWith(type));
        
        if (!hasValidType && !trimmedCode.toLowerCase().includes('graph')) {
          // Если это не распознанный тип, пробуем использовать flowchart по умолчанию
          const fallbackCode = `flowchart LR\n  A[${trimmedCode}] --> B[Конец]`;
          const res = await mermaid.render(id, fallbackCode);
          const out = res.svg || res;
          
          if (typeof out === "string" && (out.includes("Syntax error") || out.includes("Parse error"))) {
            throw new Error("Ошибка синтаксиса диаграммы");
          }
          
          setSvg(out);
          setError(false);
          setErrorMessage("");
          return;
        }
        
        const res = await mermaid.render(id, trimmedCode);
        const out = res.svg || res;
        
        // Проверяем на ошибки синтаксиса
        if (typeof out === "string" && (out.includes("Syntax error in text") || out.includes("Parse error"))) {
          setError(true);
          setErrorMessage("Ошибка синтаксиса Mermaid диаграммы");
          setSvg(`<pre class="overflow-x-auto p-3 rounded bg-muted text-sm">${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`);
        } else {
          setSvg(out);
          setError(false);
          setErrorMessage("");
        }
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        setError(true);
        setErrorMessage(`Ошибка рендеринга: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
        setSvg(`<pre class="overflow-x-auto p-3 rounded bg-muted text-sm">${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`);
      }
    };
    
    renderDiagram();
  }, [code]);
  
  return (
    <div className="my-4">
      {error && (
        <div className="text-xs text-muted-foreground mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
          ⚠️ {errorMessage || "Диаграмма не может быть отображена. Показан исходный код."}
        </div>
      )}
      <div className="overflow-x-auto border border-border rounded-lg p-4 bg-background" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
};

const MermaidLinechartFallback = ({ code }: { code: string }) => {
  const [rows, setRows] = useState<{ label: string; value: number }[]>([]);
  const [title, setTitle] = useState<string>("Линейный график");
  const [error, setError] = useState<string>("");
  
  useEffect(() => {
    try {
      const lines = String(code).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const t = lines.find(l => /^title\b/i.test(l));
      if (t) {
        const m = t.match(/^title\s+(.+)$/i);
        if (m) setTitle(m[1].replace(/^"|"$/g, ''));
      }
      const data: { label: string; value: number }[] = [];
      for (const l of lines) {
        if (/^\S.*:\s*[-+]?\d+(?:[.,]\d+)?$/.test(l)) {
          const idx = l.indexOf(":");
          const label = l.slice(0, idx).trim();
          const valStr = l.slice(idx + 1).trim().replace(",", ".");
          const value = parseFloat(valStr);
          if (!Number.isNaN(value)) data.push({ label, value });
        }
      }
      if (data.length === 0) {
        setError("Нет данных для отображения");
      } else {
        setRows(data);
        setError("");
      }
    } catch (err) {
      console.error("Error parsing linechart data:", err);
      setError("Ошибка при разборе данных графика");
      setRows([]);
    }
  }, [code]);
  
  if (error) {
    return (
      <div className="my-4">
        <div className="text-xs text-muted-foreground mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          ⚠️ {error}
        </div>
        <pre className="overflow-x-auto p-3 rounded bg-muted text-sm">{code}</pre>
      </div>
    );
  }
  
  return (
    <div className="my-4">
      <div className="text-xs text-muted-foreground mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
        Диаграмма не поддерживается. Показана таблица данных.
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="border border-border px-2 py-1 bg-muted text-left">{title}</th>
              <th className="border border-border px-2 py-1 bg-muted text-right">Значение</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border border-border px-2 py-1">{r.label}</td>
                <td className="border border-border px-2 py-1 text-right">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
