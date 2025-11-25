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
import { Packer, Document, Paragraph, HeadingLevel, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, TableLayoutType } from "docx";
import mermaid from "mermaid";
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
    const parts = messages
      .filter(m => m.role === "assistant")
      .map(m => String(m.content || "").trim())
      .filter(Boolean);
    return parts.join("\n\n");
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
      const systemInstruction = "Ты профессиональный бизнес-аналитик, работающий для банка. Создавай только структурированные банковские документы в Markdown. Обязательные разделы: цели процесса, роли, входы/выходы, SLA/KPI, риски и контроли. Для процессов добавляй ровно один блок Mermaid (flowchart LR), без служебных строк/версий. Используй компактные горизонтальные таблицы, избегай вертикальных таблиц; если данных мало — используй списки. Без приветствий и пояснений, только документ.";
      const apiMessages = [
        { role: "system", content: systemInstruction },
        ...messages,
        { role: "user", content: userMessage },
      ];
      const { data, error } = await supabase.functions.invoke("ba-assistant", {
        body: { messages: apiMessages, options: { publish, domain: "ba", fileFormat, confluence: { baseUrl: confBaseUrl, spaceKey: confSpaceKey, parentPageId: confParentId, email: confEmail, apiToken: confToken, title: confTitle } } }
      });
      if (error) throw error;
      const resp = String(data.response || "");
      let unwrapped = resp.replace(/^```(?:md|markdown)?\s*[\r\n]?([\s\S]*?)\r?\n```$/i, "$1");
      setMessages(prev => [...prev, { role: "assistant", content: unwrapped }]);
      const isIncomplete = (text: string) => {
        const fences = (text.match(/```/g) || []).length;
        if (fences % 2 !== 0) return true;
        const m = text.match(/```\s*mermaid[\s\S]*?```/i);
        if (!m) return true;
        const heads = (text.match(/^#{1,6}\s+/gm) || []).length;
        if (heads < 2) return true;
        if (/\.\.\.$/.test(text)) return true;
        if (/Продолж|Далее|продолж/i.test(text.slice(-40))) return true;
        return false;
      };
      let attempts = 0;
      while (isIncomplete(unwrapped) && attempts < 2) {
        const continuation = [
          { role: "system", content: systemInstruction },
          ...messages,
          { role: "user", content: userMessage },
          { role: "assistant", content: unwrapped },
          { role: "user", content: "Продолжи и заверши документ. Не повторяй написанное. Сохраняй банковский контекст. Используй горизонтальные таблицы, избегай вертикальных." },
        ];
        const { data: data2 } = await supabase.functions.invoke("ba-assistant", {
          body: { messages: continuation, options: { publish, domain: "ba", fileFormat, confluence: { baseUrl: confBaseUrl, spaceKey: confSpaceKey, parentPageId: confParentId, email: confEmail, apiToken: confToken, title: confTitle } } }
        });
        const cont = String(data2?.response || "").replace(/^```(?:md|markdown)?\s*[\r\n]?([\s\S]*?)\r?\n```$/i, "$1");
        if (cont.trim()) {
          setMessages(prev => [...prev, { role: "assistant", content: cont }]);
          unwrapped = unwrapped + "\n\n" + cont;
        }
        attempts++;
      }
      const looksIncomplete = (() => {
        const fences = (unwrapped.match(/```/g) || []).length;
        if (fences % 2 !== 0) return true;
        const mStart = unwrapped.search(/```\s*mermaid/i);
        if (mStart >= 0) {
          const after = unwrapped.slice(mStart + 3);
          if (!/```/.test(after)) return true;
        }
        return /\.\.\.$/.test(unwrapped) || /Продолж/i.test(unwrapped.trim().slice(-20));
      })();
      if (looksIncomplete) {
        const continuation = [
          { role: "system", content: systemInstruction },
          ...messages,
          { role: "user", content: userMessage },
          { role: "assistant", content: unwrapped },
          { role: "user", content: "Продолжи предыдущий ответ. Не повторяй уже написанное. Заверши документ." },
        ];
        try {
          const { data: data2 } = await supabase.functions.invoke("ba-assistant", {
            body: { messages: continuation, options: { publish, domain: "ba", fileFormat, confluence: { baseUrl: confBaseUrl, spaceKey: confSpaceKey, parentPageId: confParentId, email: confEmail, apiToken: confToken, title: confTitle } } }
          });
          const cont = String(data2?.response || "").replace(/^```(?:md|markdown)?\s*[\r\n]?([\s\S]*?)\r?\n```$/i, "$1");
          if (cont.trim()) {
            setMessages(prev => [...prev, { role: "assistant", content: cont }]);
          }
        } catch (_err) { void 0; }
      }
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
        const raw = String(code).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        if (/^\s*linechart\b/i.test(raw)) {
          const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          let title = "Линейный график";
          const t = lines.find(l => /^title\b/i.test(l));
          if (t) {
            const m = t.match(/^title\s+(.+)$/i);
            if (m) title = m[1].replace(/^"|"$/g, '');
          }
          const rows: { label: string; value: number }[] = [];
          for (const l of lines) {
            if (/^\S.*:\s*[-+]?\d+(?:[.,]\d+)?$/.test(l)) {
              const idx = l.indexOf(":");
              const label = l.slice(0, idx).trim();
              const valStr = l.slice(idx + 1).trim().replace(",", ".");
              const value = parseFloat(valStr);
              if (!Number.isNaN(value)) rows.push({ label, value });
            }
          }
          const header = `<thead><tr><th class="border border-border px-2 py-1 bg-muted text-left">${title}</th><th class="border border-border px-2 py-1 bg-muted text-right">Значение</th></tr></thead>`;
          const body = `<tbody>${rows.map(r => `<tr><td class="border border-border px-2 py-1">${r.label}</td><td class="border border-border px-2 py-1 text-right">${r.value}</td></tr>`).join('')}</tbody>`;
          return `<div class="mb-3"><div class="text-xs text-muted-foreground mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded">Диаграмма не поддерживается. Показана таблица данных.</div><div class="overflow-x-auto"><table class="min-w-full text-sm">${header}${body}</table></div></div>`;
        }
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
      const parseBlocks = (md: string) => {
        const lines = md.split(/\r?\n/);
        const blocks: { type: "heading" | "paragraph" | "mermaid" | "table"; level?: number; text?: string; code?: string; rows?: string[][] }[] = [];
        let i = 0;
        while (i < lines.length) {
          const line = lines[i];
          const hm = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
          if (hm) {
            blocks.push({ type: "heading", level: hm[1].length, text: hm[2].trim() });
            i++; continue;
          }
          if (/^```\s*mermaid\s*$/i.test(line)) {
            let j = i + 1; const buf: string[] = [];
            while (j < lines.length && !/^```\s*$/.test(lines[j])) { buf.push(lines[j]); j++; }
            blocks.push({ type: "mermaid", code: buf.join("\n") });
            i = j + 1; continue;
          }
          if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*)+\|?$/.test(lines[i + 1])) {
            const tbl: string[] = [];
            tbl.push(line);
            i++;
            while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { tbl.push(lines[i]); i++; }
            const rawRows = tbl.map(r => r.replace(/^\|/, "").replace(/\|$/, "").split(/\|/).map(c => c.trim()));
            const rows = [rawRows[0], ...rawRows.slice(2)];
            blocks.push({ type: "table", rows });
            continue;
          }
          if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
            const ordered = /^\s*\d+\.\s+/.test(line);
            const items: string[] = [];
            while (i < lines.length && ((ordered && /^\s*\d+\.\s+/.test(lines[i])) || (!ordered && /^\s*[-*+]\s+/.test(lines[i])))) {
              items.push(lines[i].replace(/^\s*[-*+\d.]+\s+/, "").trim());
              i++;
            }
            blocks.push({ type: "list", items, ordered });
            continue;
          }
          const para: string[] = [];
          while (i < lines.length && lines[i].trim() !== "") { para.push(lines[i]); i++; }
          if (para.length) blocks.push({ type: "paragraph", text: para.join("\n") });
          while (i < lines.length && lines[i].trim() === "") i++;
        }
        return blocks;
      };
      const renderMermaidPng = async (code: string): Promise<{ data: Uint8Array; width: number; height: number }> => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
        const id = "m_docx_" + Math.random().toString(36).slice(2);
        const res = await mermaid.render(id, code) as unknown as { svg?: string } | string;
        const svg: string = typeof res === "string" ? res : String(res.svg || "");
        const vb = svg.match(/viewBox="(\d+\s+\d+\s+\d+\s+\d+)"/);
        let w = 800, h = 400;
        if (vb) {
          const parts = vb[1].split(/\s+/).map(Number); h = parts[3]; w = parts[2];
        }
        const img = new Image();
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = url; });
        const canvas = document.createElement("canvas");
        const maxW = 720; const scale = Math.min(1, maxW / w);
        canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("noctx");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob: Blob = await new Promise((resolve) => canvas.toBlob(b => resolve((b as Blob) || new Blob()), "image/png", 0.92));
        const ab = await blob.arrayBuffer();
        return { data: new Uint8Array(ab), width: canvas.width, height: canvas.height };
      };
      (async () => {
        const blocks = parseBlocks(cleaned);
        const children: (Paragraph | Table)[] = [];
        for (const b of blocks) {
          if (b.type === "heading") {
            const lvl = b.level || 2;
            const heading = lvl === 1 ? HeadingLevel.HEADING_1 : lvl === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
            children.push(new Paragraph({ text: String(b.text || ""), heading }));
          } else if (b.type === "paragraph") {
            children.push(new Paragraph({ children: [new TextRun({ text: String(b.text || ""), size: 26 })] }));
          } else if (b.type === "table" && b.rows) {
            const rows = b.rows.map((r, idx) => new TableRow({ children: r.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, bold: idx === 0, size: idx === 0 ? 26 : 24 })] })] , margins: { top: 160, bottom: 160, left: 200, right: 200 } })) }));
            const colCount = Math.max(1, b.rows[0]?.length || 1);
            const usable = 9000;
            const base = Math.max(1800, Math.floor(usable / colCount));
            const colWidths = Array(colCount).fill(base);
            children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: colWidths, layout: TableLayoutType.FIXED, rows, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, right: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, insideH: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" }, insideV: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } } }));
          } else if (b.type === "list" && b.items) {
            b.items.forEach((t, idx) => {
              const marker = (b as { ordered?: boolean }).ordered ? `${idx + 1}. ` : "• ";
              children.push(new Paragraph({ children: [new TextRun({ text: marker + t, size: 24 })] }));
            });
          } else if (b.type === "mermaid" && b.code) {
            try {
              const img = await renderMermaidPng(b.code);
              const wTarget = Math.min(720, img.width);
              const hTarget = Math.round(wTarget * (img.height / img.width));
              children.push(new Paragraph({ children: [new ImageRun({ data: img.data, transformation: { width: wTarget, height: hTarget } })] }));
            } catch {
              children.push(new Paragraph({ children: [new TextRun({ text: String(b.code || "") })] }));
            }
          }
        }
        const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }] });
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
      })();
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
          const w = window as unknown as { mermaid?: typeof mermaid };
          if (w.mermaid) {
            w.mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
            const blocks = container.querySelectorAll('.mermaid');
            let idx = 0;
            for (const el of Array.from(blocks)) {
              const code = (el.textContent || '') as string;
              try {
                const res = await w.mermaid.render('pdf_m' + (idx++), code) as unknown as { svg?: string } | string;
                const out = typeof res === 'string' ? res : res.svg || '';
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
        } catch (_e) { const _ = 0; }
      };
      renderMermaid().then(() => {
        try {
          const pdfGen = (html2pdf as unknown as { (): { from: (el: Element) => { set: (opts: { margin: number; filename: string; html2canvas: { scale: number } }) => { save: () => void } } } });
          pdfGen().from(container).set({ margin: 10, filename: `BA_Document_${stamp}.pdf`, html2canvas: { scale: 2 } }).save();
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
        const parseTables = (md: string) => {
          const lines = md.split(/\r?\n/);
          const tables: string[][][] = [];
          let i = 0;
          while (i < lines.length) {
            const line = lines[i];
            if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*)+\|?$/.test(lines[i + 1])) {
              const tbl: string[] = [];
              tbl.push(line);
              i++;
              while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { tbl.push(lines[i]); i++; }
              const rows = tbl.map(r => r.replace(/^\|/, '').replace(/\|$/, '').split(/\|/).map(c => c.trim()));
              const cleanRows = [rows[0], ...rows.slice(2)];
              tables.push(cleanRows);
              continue;
            }
            i++;
          }
          return tables;
        };
        const tables = parseTables(cleaned);
        const wb = XLSX.utils.book_new();
        if (tables.length === 0) {
          const ws = XLSX.utils.aoa_to_sheet([["Нет таблиц в документе"]]);
          XLSX.utils.book_append_sheet(wb, ws, "Таблицы");
        } else {
          tables.forEach((t, idx) => {
            const ws = XLSX.utils.aoa_to_sheet(t);
            ws["!cols"] = t[0]?.map(() => ({ wch: 30 })) || [{ wch: 30 }];
            XLSX.utils.book_append_sheet(wb, ws, `Таблица ${idx + 1}`);
          });
        }
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
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
    if (e.key === "Enter") {
      if (e.shiftKey) {
        return;
      }
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
        
        
        <div className="flex flex-wrap gap-3 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Опишите вашу задачу или вопрос..."
            className="min-h-[60px] max-h-[200px] resize-none w-full flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="md:h-[60px] md:w-[60px] h-10 w-10 shrink-0 shadow-lg hover:shadow-glow transition-all"
          >
            <Send className="h-5 w-5" />
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isLoading}
            size="icon"
            variant="outline"
            className="md:h-[60px] md:w-[60px] h-10 w-10 shrink-0"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
