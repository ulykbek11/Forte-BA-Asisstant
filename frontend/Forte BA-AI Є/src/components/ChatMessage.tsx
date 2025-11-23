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
}

const ChatMessage = ({ role, content, isThinking }: ChatMessageProps) => {
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
          "max-w-[70%] rounded-2xl px-5 py-3 shadow-md transition-all",
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
                    return <MermaidBlock code={code} />;
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
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
    const id = "mermaid-" + Math.random().toString(36).slice(2);
    mermaid
      .render(id, code)
      .then((res: any) => {
        const out = res.svg || res;
        if (typeof out === "string" && out.includes("Syntax error in text")) {
          setSvg(`<pre class="overflow-x-auto p-3 rounded bg-muted">${code}</pre>`);
        } else {
          setSvg(out);
        }
      })
      .catch(() => setSvg(`<pre class="overflow-x-auto p-3 rounded bg-muted">${code}</pre>`));
  }, [code]);
  return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
};
