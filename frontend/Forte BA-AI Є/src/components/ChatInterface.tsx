import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
 
import { Switch } from "@/components/ui/switch";
import { Send, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ChatMessage from "./ChatMessage";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/client";
import { marked } from "marked";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import html2pdf from "html2pdf.js";
import { Packer, Document, Paragraph, HeadingLevel, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, TableLayoutType } from "docx";
import mermaid from "mermaid";
import * as XLSX from "xlsx";

interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: { type: "docx" | "pdf" | "html" | "xlsx"; name: string; url: string }[];
}

const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [publish, setPublish] = useState(false);
  const [confBaseUrl, setConfBaseUrl] = useState("");
  const [confSpaceKey, setConfSpaceKey] = useState("");
  const [confParentId, setConfParentId] = useState("");
  const [confEmail, setConfEmail] = useState("");
  const [confToken, setConfToken] = useState("");
  const [confTitle, setConfTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  type KB = { goals: string[]; roles: string[]; inputs: string[]; outputs: string[]; sla: string[]; kpi: string[]; risks: string[]; controls: string[]; assumptions: string[]; facts: string[] };
  const defaultKb: KB = { goals: [], roles: [], inputs: [], outputs: [], sla: [], kpi: [], risks: [], controls: [], assumptions: [], facts: [] };
  const [kb, setKb] = useState<KB>(() => {
    try {
      const raw = localStorage.getItem("ba_kb_v1") || "";
      const j = raw ? JSON.parse(raw) as KB : defaultKb;
      const sanitize = (arr?: string[]) => Array.isArray(arr) ? arr.filter(Boolean).map(s => String(s).trim()).filter(Boolean).slice(0, 200) : [];
      return {
        goals: sanitize(j.goals), roles: sanitize(j.roles), inputs: sanitize(j.inputs), outputs: sanitize(j.outputs), sla: sanitize(j.sla), kpi: sanitize(j.kpi), risks: sanitize(j.risks), controls: sanitize(j.controls), assumptions: sanitize(j.assumptions), facts: sanitize(j.facts)
      };
    } catch { return defaultKb; }
  });
  const saveKb = (state: KB) => { try { localStorage.setItem("ba_kb_v1", JSON.stringify(state)); } catch { void 0; } };
  const uniqMerge = (a: string[], b: string[]) => {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const out: string[] = [...a];
    for (const x of b) { const nx = norm(x); if (!out.some(y => norm(y) === nx)) out.push(x); }
    return out.filter(Boolean).slice(0, 400);
  };
  const mergeKb = (base: KB, delta: KB): KB => ({
    goals: uniqMerge(base.goals, delta.goals), roles: uniqMerge(base.roles, delta.roles), inputs: uniqMerge(base.inputs, delta.inputs), outputs: uniqMerge(base.outputs, delta.outputs), sla: uniqMerge(base.sla, delta.sla), kpi: uniqMerge(base.kpi, delta.kpi), risks: uniqMerge(base.risks, delta.risks), controls: uniqMerge(base.controls, delta.controls), assumptions: uniqMerge(base.assumptions, delta.assumptions), facts: uniqMerge(base.facts, delta.facts)
  });
  const extractFactsFromText = (text: string): KB => {
    const t = String(text || "");
    const lines = t.split(/\r?\n/);
    const pickSection = (names: RegExp[]) => {
      const idx = lines.findIndex(l => names.some(r => r.test(l)));
      if (idx === -1) return [] as string[];
      const out: string[] = [];
      for (let i = idx + 1; i < lines.length; i++) {
        const l = lines[i];
        if (/^\s*#{1,6}\s+/.test(l)) break;
        if (/^\s*[-*+]\s+/.test(l) || /^\s*•\s+/.test(l)) out.push(l.replace(/^\s*([-*+]|•)\s+/, "").trim());
        else if (/^\s*\d+[.)]\s+/.test(l)) out.push(l.replace(/^\s*\d+[.)]\s+/, "").trim());
        else if (l.trim() && !/^```/.test(l)) out.push(l.trim());
      }
      return out.filter(Boolean);
    };
    const pickInline = (key: RegExp) => {
      const out: string[] = [];
      for (const l of lines) {
        if (key.test(l)) {
          const m = l.split(":");
          if (m.length > 1) out.push(m.slice(1).join(":").trim());
          else out.push(l.trim());
        }
      }
      return out.filter(Boolean);
    };
    const hasWord = (l: string, keys: RegExp[]) => keys.some(r => r.test(l));
    const collectByWords = (keys: RegExp[]) => {
      const out: string[] = [];
      for (const l of lines) {
        const s = l.trim();
        if (!s || /^```/.test(s)) continue;
        if (hasWord(s, keys)) {
          const m = s.split(/[:–—-]/);
          if (m.length > 1) out.push(m.slice(1).join(":").trim()); else out.push(s);
        }
      }
      return out.filter(Boolean);
    };
    const goals = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+цели\b/i, /^\s*цели\s*:/i, /^\s*назначение\b/i]),
      ...pickInline(/\b(цели|цель|назначение)\s*:/i),
      ...collectByWords([/\bцели\b/i, /\bцель\b/i, /\bназначение\b/i, /\bobjective\b/i, /\bpurpose\b/i])
    ]));
    const roles = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+роли\b/i, /^\s*#{1,6}\s+акторы\b/i, /^\s*роли\s*:/i, /^\s*акторы\s*:/i]),
      ...pickInline(/\b(роли|акторы|ответственн\w+)\s*:/i),
      ...collectByWords([/\bроли\b/i, /\bроль\b/i, /\bакторы\b/i, /\bучастники\b/i, /\bответственн\w+\b/i])
    ]));
    const inputs = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+входы\b/i, /^\s*входы\s*:/i]),
      ...pickInline(/\bвходы\s*:/i),
      ...collectByWords([/\bвход\w*\b/i, /\bисточники?\b/i, /\binput\b/i])
    ]));
    const outputs = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+выходы\b/i, /^\s*выходы\s*:/i]),
      ...pickInline(/\bвыходы\s*:/i),
      ...collectByWords([/\bвыход\w*\b/i, /\bрезультат\w*\b/i, /\bartefact\b/i, /\bdeliverable\b/i, /\boutput\b/i])
    ]));
    const sla = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+sla\b/i, /^\s*sla\s*:/i]),
      ...pickInline(/\bsla\s*:/i),
      ...collectByWords([/\bsla\b/i, /уровень\s+сервиса/i, /время\s+(ответа|обработки)/i])
    ]));
    const kpi = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+kpi\b/i, /^\s*kpi\s*:/i, /^\s*метрики\s*:/i, /^\s*показатели\s*:/i]),
      ...pickInline(/\b(kpi|метрики|показатели)\s*:/i),
      ...collectByWords([/\bkpi\b/i, /\bметрик\w*\b/i, /\bпоказател\w*\b/i])
    ]));
    const risks = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+риски\b/i, /^\s*риски\s*:/i]),
      ...pickInline(/\bриски\s*:/i),
      ...collectByWords([/\bриск\w*\b/i, /угроз\w*/i, /проблем\w*/i, /pain\s*point/i])
    ]));
    const controls = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+контроли\b/i, /^\s*контроли\s*:/i, /^\s*контрмеры\s*:/i]),
      ...pickInline(/\b(контроли|контрмеры)\s*:/i),
      ...collectByWords([/контрол\w*/i, /провер\w*/i, /комплаенс/i, /mitigation/i, /процедур\w*/i])
    ]));
    const assumptions = Array.from(new Set([
      ...pickSection([/^\s*#{1,6}\s+допущения\b/i, /^\s*допущения\s*:/i]),
      ...pickInline(/\bдопущения\s*:/i),
      ...collectByWords([/допущени\w*/i, /предпосылк\w*/i, /assumption/i])
    ]));
    const facts: string[] = [];
    for (const l of lines) {
      const m = l.match(/^\s*([A-Za-zА-Яа-я0-9_\s]{2,20})\s*:\s*(.+)$/);
      if (m) facts.push(m[0].trim());
    }
    return { goals, roles, inputs, outputs, sla, kpi, risks, controls, assumptions, facts };
  };
  const buildKnowledgeSummary = (state: KB) => {
    const b = state;
    const section = (name: string, arr: string[]) => arr.length ? `### ${name}\n` + arr.slice(0, 8).map(x => `- ${x}`).join("\n") + "\n\n" : "";
    const s = "## Контекст\n\n" +
      section("Цели", b.goals) +
      section("Роли", b.roles) +
      section("Входы", b.inputs) +
      section("Выходы", b.outputs) +
      section("SLA", b.sla) +
      section("KPI", b.kpi) +
      section("Риски", b.risks) +
      section("Контроли", b.controls) +
      section("Допущения", b.assumptions);
    return s.trim();
  };
  const updateKbFromText = (txt: string) => {
    const delta = extractFactsFromText(txt);
    setKb(prev => { const merged = mergeKb(prev, delta); saveKb(merged); return merged; });
  };
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

  const buildHtmlBody = (md: string) => {
    const sanitizeMermaid = (code: string) => {
      const lines = String(code).split(/\r?\n/).filter(l => !/^\s*mermaid\s+version\b/i.test(l));
      let out = lines.join("\n");
      const isPie = /^\s*pie\b/i.test(out);
      if (isPie) {
        out = out.replace(/:\s*(-?\d+(?:[.,]\d+)?)\s*%/g, (_m, num) => `: ${String(num).replace(/,/g, '.')}`);
      }
      return out.trim();
    };
    const normalizeMermaidOrientation = (code: string) => {
      let s = String(code).trim();
      const m = s.match(/^\s*(flowchart|graph)\b[^\n]*/i);
      if (m) {
        let first = m[0];
        if (!/\bLR\b/i.test(first)) {
          first = first.replace(/\b(TB|TD|BT|RL)\b/i, 'LR');
          if (!/\bLR\b/i.test(first)) first = first.replace(/^\s*(flowchart|graph)\b/i, (t) => t + ' LR');
          s = s.replace(/^\s*(flowchart|graph)\b[^\n]*/i, first);
        }
      }
      return s;
    };
    const htmlBody = marked.parse(md)
      .replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_m, code) => {
        const raw0 = String(code).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        const raw = normalizeMermaidOrientation(sanitizeMermaid(raw0));
        if (/^\s*linechart\b/i.test(raw)) {
          const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          let title = "Линейный график";
          const t = lines.find(l => /^title\b/i.test(l));
          if (t) {
            const m = t.match(/^title\s+(.+)$/i);
            if (m) title = m[1].replace(/^"|"$/g, "");
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
    return htmlBody;
  };

  const stripMeta = (text: string) => {
    const lines = text.split(/\r?\n/);
    const dropStarts = [/^\s*Уважаемый/i, /^\s*Пожалуйста/i, /^\s*Если вам/i, /^\s*Если же/i, /^\s*Я уже/i, /^\s*В предыдущем/i, /^\s*Извините/i, /^\s*Документ, содержащий/i, /^\s*Завершение документа/i];
    const out: string[] = [];
    let skipBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (dropStarts.some(r => r.test(l))) { skipBlock = true; continue; }
      if (skipBlock) {
        if (/^\s*#/.test(l) || /^```/.test(l) || /^\|/.test(l) || /^\s*[-*+]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) { skipBlock = false; out.push(l); }
        continue;
      }
      out.push(l);
    }
    return out.join("\n");
  };

  const trimTrailingMeta = (text: string) => {
    const lines = text.split(/\r?\n/);
    const drop = [/^\s*Завершение документа/i, /^\s*Надеюсь/i, /^\s*Пожалуйста, уточните/i, /^\s*Если вам/i, /^\s*Извините/i];
    let end = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (drop.some(r => r.test(l))) { end = i; continue; }
      if (/^\s*#/.test(l) || /^```/.test(l) || /^\|/.test(l) || /^\s*[-*+]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) { break; }
    }
    return lines.slice(0, end).join("\n");
  };

  const needsMoreData = (text: string) => {
    if (/\bN\/A\b|\bUNKNOWN\b|\bTBD\b|нет данных|данные отсутствуют/i.test(text)) return true;
    const hLines = (text.match(/^#{1,6}\s+.*$/gm) || []).map(s => s.toLowerCase());
    const hasGoals = hLines.some(s => /цели\b/.test(s));
    const hasRoles = hLines.some(s => /роли|участники/.test(s));
    const hasIO = hLines.some(s => /входы\/?выходы|входы|выходы/.test(s));
    const hasSla = hLines.some(s => /sla|kpi|sla\/kpi/.test(s));
    const hasRisks = hLines.some(s => /риски/.test(s));
    const hasControls = hLines.some(s => /контроли/.test(s));
    const count = [hasGoals, hasRoles, hasIO, hasSla, hasRisks, hasControls].filter(Boolean).length;
    if (count < 2) return true;
    const tbls = text.match(/\n\|[^\n]*\|[\s\S]*?(?:\n\n|$)/g);
    if (tbls && tbls.length > 0) {
      const isBad = tbls.some(t => {
        const rows = t
          .split(/\n/)
          .filter(l => /^\|.*\|\s*$/.test(l))
          .map(l => l.replace(/^\|/, '').replace(/\|$/, '').split(/\|/).map(c => c.trim()));
        const dataRows = rows.slice(2);
        const cells = dataRows.flat();
        if (cells.length === 0) return true;
        const emptyLike = (v: string) => v === '' || /^(?:n\/a|unknown|tbd|—|-|нет)$/i.test(v);
        const emptyCount = cells.filter(emptyLike).length;
        const ratio = emptyCount / cells.length;
        return ratio > 0.8;
      });
      if (isBad) return true;
    }
    return false;
  };

  const buildDataRequest = (userText: string, docText: string, _baseKb?: KB) => {
    const text = String(docText || "");
    const userFacts = extractFactsFromText(String(userText || ""));
    const hLines = (text.match(/^#{1,6}\s+.*$/gm) || []).map(s => s.toLowerCase());
    const hasGoals = hLines.some(s => /цели\b/.test(s));
    const hasRoles = hLines.some(s => /роли|участники/.test(s));
    const hasIO = hLines.some(s => /входы\/?выходы|входы|выходы/.test(s));
    const hasSlaKpi = hLines.some(s => /sla|kpi|sla\/kpi/.test(s));
    const hasRisks = hLines.some(s => /риски/.test(s));
    const hasControls = hLines.some(s => /контроли/.test(s));
    const has = (arr?: string[]) => Array.isArray(arr) && arr.length > 0;
    const reqs: string[] = [];
    const hasGoalsUser = has(userFacts.goals);
    const hasRolesUser = has(userFacts.roles);
    const hasInputsUser = has(userFacts.inputs);
    const hasOutputsUser = has(userFacts.outputs);
    const hasSlaUser = has(userFacts.sla);
    const hasKpiUser = has(userFacts.kpi);
    const hasRisksUser = has(userFacts.risks);
    const hasControlsUser = has(userFacts.controls);
    if (!(hasGoals || hasGoalsUser)) reqs.push("Уточните цели процесса/анализа (1–2 пункта)");
    if (!(hasRoles || hasRolesUser)) reqs.push("Перечислите роли и их ответственность");
    if (!(hasIO || hasInputsUser || hasOutputsUser)) reqs.push("Опишите ключевые входы (источники) и выходы (результаты)");
    if (!(hasSlaKpi || hasSlaUser || hasKpiUser)) reqs.push("Укажите KPI (метрика, цель, период) и SLA");
    if (!(hasRisks || hasRisksUser)) reqs.push("Добавьте основные риски (3–5 пунктов)");
    if (!(hasControls || hasControlsUser)) reqs.push("Опишите действующие контроли/проверки и ответственных");
    if (/\bN\/A\b|\bUNKNOWN\b|\bTBD\b|нет данных|данные отсутствуют/i.test(text) || /\bN\/A\b|\bUNKNOWN\b|\bTBD\b|нет данных|данные отсутствуют/i.test(userText)) reqs.push("Предоставьте недостающие числовые значения и факты");
    const tbls = text.match(/\n\|[^\n]*\|[\s\S]*?(?:\n\n|$)/g);
    if (tbls && tbls.length > 0) {
      const isBad = tbls.some(t => {
        const rows = t
          .split(/\n/)
          .filter(l => /^\|.*\|\s*$/.test(l))
          .map(l => l.replace(/^\|/, '').replace(/\|$/, '').split(/\|/).map(c => c.trim()));
        const cells = rows.slice(2).flat();
        if (cells.length === 0) return true;
        const emptyLike = (v: string) => v === '' || /^(?:n\/a|unknown|tbd|—|-|нет)$/i.test(v);
        const ratio = cells.filter(emptyLike).length / cells.length;
        return ratio > 0.6;
      });
      if (isBad) reqs.push("Заполните пустые ячейки таблиц (более 60% пусто)");
    }
    const uniq = Array.from(new Set(reqs));
    if (uniq.length === 0) return "";
    const present: string[] = [];
    if (hasGoals || hasGoalsUser) present.push("Цели");
    if (hasRoles || hasRolesUser) present.push("Роли");
    if (hasIO || hasInputsUser || hasOutputsUser) present.push("Входы/выходы");
    if (hasSlaKpi || hasSlaUser || hasKpiUser) present.push("SLA/KPI");
    if (hasRisks || hasRisksUser) present.push("Риски");
    if (hasControls || hasControlsUser) present.push("Контроли");
    const head1 = "Уже указано:";
    const head2 = "Нужно уточнить:";
    const body1 = present.length ? present.map(s => `- ${s}`).join("\n") : "- —";
    const body2 = uniq.map(q => `- ${q}`).join("\n");
    return `${head1}\n\n${body1}\n\n${head2}\n\n${body2}`;
  };

  const buildHtmlDocument = (md: string) => {
    const htmlBody = buildHtmlBody(md);
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
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function(){
      try {
        if (window.mermaid) {
          window.mermaid.initialize({startOnLoad:false, securityLevel:'loose'});
          var blocks = document.querySelectorAll('.mermaid');
          var idx = 0;
          blocks.forEach(function(el){
            var code = el.textContent || '';
            var norm = (function(c){
              var s = String(c).trim();
              var m = s.match(/^\\s*(flowchart|graph)\\b[^\\n]*/i);
              if (m) {
                var first = m[0];
                if (!/\\bLR\\b/i.test(first)) {
                  first = first.replace(/\\b(TB|TD|BT|RL)\\b/i, 'LR');
                  if (!/\\bLR\\b/i.test(first)) first = first.replace(/^\\s*(flowchart|graph)\\b/i, function(t){ return t + ' LR'; });
                  s = s.replace(/^\\s*(flowchart|graph)\\b[^\\n]*/i, first);
                }
              }
              return s;
            })(code);
            window.mermaid.render('m'+(idx++), norm).then(function(res){
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
        if (window.renderMathInElement) {
          window.renderMathInElement(document.body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false });
        }
      } catch(e) {}
    });
  </script>
</head>
<body>
${htmlBody}
</body>
</html>`;
    return html;
  };

  const generateDocxBlob = async (md: string): Promise<Blob> => {
    const parseBlocks = (mdText: string) => {
      const lines = mdText.split(/\r?\n/);
      const blocks: { type: "heading" | "paragraph" | "mermaid" | "table" | "list"; level?: number; text?: string; code?: string; rows?: string[][]; items?: string[]; ordered?: boolean }[] = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const hm = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
        if (hm) { blocks.push({ type: "heading", level: hm[1].length, text: hm[2].trim() }); i++; continue; }
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
        if (/^\s*[-*+]\s+/.test(line) || /^\s*•\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
          const ordered = /^\s*\d+[.)]\s+/.test(line);
          const items: string[] = [];
          while (
            i < lines.length && (
              (ordered && /^\s*\d+[.)]\s+/.test(lines[i])) ||
              (!ordered && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*•\s+/.test(lines[i])))
            )
          ) {
            items.push(lines[i].replace(/^\s*([-*+]|•|\d+[.)])\s+/, "").trim());
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
      const sanitizedLines = String(code).split(/\r?\n/).filter(l => !/^\s*mermaid\s+version\b/i.test(l));
      let sanitized = sanitizedLines.join("\n");
      if (/^\s*pie\b/i.test(sanitized)) {
        sanitized = sanitized.replace(/:\s*(-?\d+(?:[.,]\d+)?)\s*%/g, (_m, num) => `: ${String(num).replace(/,/g, '.')}`);
      }
      const norm = (function(c:string){
        let s = String(c).trim();
        const m = s.match(/^\s*(flowchart|graph)\b[^\n]*/i);
        if (m) {
          let first = m[0];
          if (!/\bLR\b/i.test(first)) {
            first = first.replace(/\b(TB|TD|BT|RL)\b/i, 'LR');
            if (!/\bLR\b/i.test(first)) first = first.replace(/^\s*(flowchart|graph)\b/i, (t) => t + ' LR');
            s = s.replace(/^\s*(flowchart|graph)\b[^\n]*/i, first);
          }
        }
        return s;
      })(sanitized);
      const res = await mermaid.render(id, norm) as unknown as { svg?: string } | string;
      const svg: string = typeof res === "string" ? res : String((res as { svg?: string }).svg || "");
      const vb = svg.match(/viewBox="(\d+\s+\d+\s+\d+\s+\d+)"/);
      let w = 800, h = 400;
      if (vb) { const parts = vb[1].split(/\s+/).map(Number); h = parts[3]; w = parts[2]; }
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
    const blocks = parseBlocks(md);
    const children: (Paragraph | Table | Paragraph)[] = [];
    const computeColWidths = (rows: string[][]) => {
      const colCount = Math.max(1, rows[0]?.length || 1);
      const contentWidth = 9360;
      const minTwips = 2000;
      const weights = Array(colCount).fill(0);
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || [];
        for (let c = 0; c < colCount; c++) {
          const text = String(row[c] ?? "");
          const len = text.length;
          if (len > weights[c]) weights[c] = len;
        }
      }
      const safeWeights = weights.map(w => Math.max(w, 10));
      const totalW = safeWeights.reduce((a,b)=>a+b, 0);
      let widths = safeWeights.map(w => Math.floor((contentWidth * w) / (totalW || 1)));
      widths = widths.map(w => Math.max(minTwips, w));
      const sum = widths.reduce((a,b)=>a+b,0);
      if (sum > contentWidth) {
        let overflow = sum - contentWidth;
        while (overflow > 0) {
          let idx = 0; let maxVal = widths[0];
          for (let i = 1; i < widths.length; i++) { if (widths[i] > maxVal) { maxVal = widths[i]; idx = i; } }
          const canReduce = widths[idx] - minTwips;
          if (canReduce <= 0) break;
          const d = Math.min(canReduce, Math.max(1, Math.ceil(overflow / widths.length)));
          widths[idx] -= d;
          overflow -= d;
        }
      }
      return widths;
    };
    for (const b of blocks) {
      if (b.type === "heading") {
        const lvl = b.level || 2;
        const heading = lvl === 1 ? HeadingLevel.HEADING_1 : lvl === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
        children.push(new Paragraph({ text: String(b.text || ""), heading }));
      } else if (b.type === "paragraph") {
        children.push(new Paragraph({ children: [new TextRun({ text: String(b.text || ""), size: 26 })] }));
      } else if (b.type === "table" && b.rows) {
        const rows = b.rows.map((r, idx) => new TableRow({ children: r.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, bold: idx === 0, size: idx === 0 ? 26 : 24 })] })] , margins: { top: 160, bottom: 160, left: 200, right: 200 } })) }));
        const colWidths = computeColWidths(b.rows);
        children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: colWidths, layout: TableLayoutType.FIXED, rows, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, right: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" }, insideH: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" }, insideV: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } } }));
      } else if (b.type === "list" && b.items) {
        b.items.forEach((t, idx) => { const marker = b.ordered ? `${idx + 1}. ` : "• "; children.push(new Paragraph({ children: [new TextRun({ text: marker + t, size: 24 })] })); });
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
    const blob = await Packer.toBlob(doc);
    return blob;
  };

  const generateHtmlBlob = (md: string): Blob => {
    const html = buildHtmlDocument(md);
    return new Blob([html], { type: "text/html;charset=utf-8" });
  };

  const generatePdfBlob = async (md: string): Promise<Blob> => {
    const htmlBody = buildHtmlBody(md);
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
            const raw = (el.textContent || '') as string;
            const lines = raw.split(/\r?\n/).filter(l => !/^\s*mermaid\s+version\b/i.test(l));
            let code = lines.join("\n");
            if (/^\s*pie\b/i.test(code)) {
              code = code.replace(/:\s*(-?\d+(?:[.,]\d+)?)\s*%/g, (_m, num) => `: ${String(num).replace(/,/g, '.')}`);
            }
            const norm = (function(c:string){
              let s = String(c).trim();
              const m = s.match(/^\s*(flowchart|graph)\b[^\n]*/i);
              if (m) {
                let first = m[0];
                if (!/\bLR\b/i.test(first)) {
                  first = first.replace(/\b(TB|TD|BT|RL)\b/i, 'LR');
                  if (!/\bLR\b/i.test(first)) first = first.replace(/^\s*(flowchart|graph)\b/i, (t) => t + ' LR');
                  s = s.replace(/^\s*(flowchart|graph)\b[^\n]*/i, first);
                }
              }
              return s;
            })(code);
            try {
              const res = await w.mermaid.render('pdf_m' + (idx++), norm) as unknown as { svg?: string } | string;
              const out = typeof res === 'string' ? res : (res as { svg?: string }).svg || '';
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
    const renderMath = async () => {
      try {
        const w = window as unknown as { renderMathInElement?: (el: Element, opts?: Record<string, unknown>) => void };
        if (!w.renderMathInElement) {
          await new Promise<void>((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
            document.head.appendChild(link);
            const s1 = document.createElement('script');
            s1.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
            s1.onload = () => {
              const s2 = document.createElement('script');
              s2.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js';
              s2.onload = () => resolve();
              document.head.appendChild(s2);
            };
            document.head.appendChild(s1);
          });
        }
        const rw = window as unknown as { renderMathInElement?: (el: Element, opts?: Record<string, unknown>) => void };
        if (rw.renderMathInElement) {
          rw.renderMathInElement(container, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false });
        }
      } catch (_e) { const _ = 0; }
    };
    await renderMermaid();
    await renderMath();
    try {
      const pdfGen = html2pdf as unknown as { (): { from: (el: Element) => { set: (opts: { margin: number; filename: string; html2canvas: { scale: number } }) => { toPdf: () => { get: (name: 'pdf') => Promise<{ output: (type: 'blob') => Blob }> } } } } };
      const worker = pdfGen().from(container).set({ margin: 10, filename: `BA_Document`, html2canvas: { scale: 2 } });
      const pdf = await worker.toPdf().get('pdf');
      const blob: Blob = pdf.output('blob');
      return blob;
    } finally {
      document.body.removeChild(container);
    }
  };

  const generateXlsxBlob = (md: string): Blob => {
    const parseTables = (mdText: string) => {
      const lines = mdText.split(/\r?\n/);
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
    const tables = parseTables(md);
    const wb = XLSX.utils.book_new();
    if (tables.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([["Нет таблиц в документе"]]);
      XLSX.utils.book_append_sheet(wb, ws, "Таблицы");
    } else {
      tables.forEach((t, idx) => {
        const ws = XLSX.utils.aoa_to_sheet(t) as XLSX.WorkSheet;
        ws["!cols"] = t[0]?.map(() => ({ wch: 30 })) || [{ wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, `Таблица ${idx + 1}`);
      });
    }
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return blob;
  };

  const isDocLikeText = (txt: string) => {
    const t = String(txt || "");
    const heads = (t.match(/^#{1,6}\s+.+$/gm) || []).length;
    const mermaids = Array.from(t.matchAll(/```\s*mermaid[\s\S]*?```/gi)).length;
    const hasKeyWords = /цели\b|роли\b|входы|выходы|sla|kpi|риски|контроли/i.test(t);
    return heads >= 2 || mermaids >= 1 || hasKeyWords;
  };

  const buildLocalDoc = (userText: string): string => {
    const facts = extractFactsFromText(userText);
    const merged = mergeKb(kb, facts);
    const escapeCell = (s: string) => String(s || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const makeTable = (headers: string[], rows: string[][]) => {
      if (!rows.length) return "";
      const head = `| ${headers.map(escapeCell).join(" | ")} |`;
      const sep = `| ${headers.map(() => ":-").join(" | ")} |`;
      const body = rows.map(r => `| ${r.map(escapeCell).join(" | ")} |`).join("\n");
      return `${head}\n${sep}\n${body}\n\n`;
    };
    const hasSome = [merged.goals, merged.roles, merged.inputs, merged.outputs, merged.sla, merged.kpi, merged.risks, merged.controls]
      .some(arr => Array.isArray(arr) && arr.length > 0);
    if (!hasSome && !userText.trim()) return "";
    const title = `# Документ задачи\n\n`;
    const ctx = userText.trim() ? `## Контекст\n\n${userText.trim().split(/\r?\n/).slice(0, 10).join("\n")}\n\n` : "";
    const inputsRows = (merged.inputs || []).slice(0, 8).map(x => ["Вход", x]);
    const outputsRows = (merged.outputs || []).slice(0, 8).map(x => ["Выход", x]);
    const ioTable = makeTable(["Тип", "Элемент"], [...inputsRows, ...outputsRows]);
    const kpiRows = (merged.kpi || []).slice(0, 8).map(x => [x]);
    const slaRows = (merged.sla || []).slice(0, 8).map(x => [x]);
    const kpiTable = makeTable(["Показатель"], kpiRows);
    const slaTable = makeTable(["SLA"], slaRows);
    const sectionList = (name: string, arr: string[]) => arr.length ? `## ${name}\n\n${arr.slice(0, 6).map(x => `- ${x}`).join("\n")}\n\n` : "";
    const buildMermaid = () => {
      const hasInputs = Array.isArray(merged.inputs) && merged.inputs.length > 0;
      const hasOutputs = Array.isArray(merged.outputs) && merged.outputs.length > 0;
      const goal = (merged.goals || [])[0] || "Процесс";
      if (!hasInputs && !hasOutputs && !goal) return "";
      const esc = (s: string) => String(s || "").replace(/"/g, "'").replace(/\r?\n/g, " ");
      let code = "flowchart LR\n";
      code += `P["${esc(goal)}"]\n`;
      merged.inputs.slice(0, 5).forEach((v, i) => { code += `I${i}["${esc(v)}"]\nI${i}-->P\n`; });
      merged.outputs.slice(0, 5).forEach((v, i) => { code += `P-->O${i}["${esc(v)}"]\n`; });
      return `\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\n`;
    };
    const body =
      sectionList("Цели процесса", merged.goals) +
      sectionList("Роли", merged.roles) +
      (ioTable ? `## Входы/выходы\n\n${ioTable}` : "") +
      (kpiTable ? `## KPI\n\n${kpiTable}` : "") +
      (slaTable ? `## SLA\n\n${slaTable}` : "") +
      sectionList("Риски", merged.risks) +
      sectionList("Контроли", merged.controls) +
      buildMermaid();
    return (title + ctx + body).trim();
  };

  const buildLocalChatReply = (userText: string): string => {
    const t = userText.toLowerCase();
    if (/\b(sla|service\s*level\s*agreement)\b/i.test(userText)) {
      return "SLA в банковских процессах — согласованный уровень сервиса для клиента и внутренних пользователей. Типичные метрики: время обработки (TAT), доступность (%) за период, доля успешных операций и точность данных. Измерение: медиана и 95‑й перцентиль времени по ключевым этапам, аптайм систем, First Pass Yield и доля повторных обращений. Для контроля SLA формируют KPI, пороги и процедуры эскалации.";
    }
    if (/\bkpi\b|метрик|метрики/i.test(t)) {
      return "KPI в банке — измеримые индикаторы достижения целей процесса/продукта: TAT, конверсия, точность, отказоустойчивость, NPS. Формулируют определение, формулу, периодичность, источник данных и пороговые значения. KPI связывают с SLA и бизнес‑целями, используют дашборды и алерты.";
    }
    if (/\bbrd\b|тз|требован/i.test(t)) {
      return "BRD — документ бизнес‑требований: цель, описание, scope, стейкхолдеры, бизнес‑правила, нефункциональные требования, ограничения, риски и KPI. Сначала собирают и валидируют требования с владельцами процесса, затем согласуют версию и передают в разработку.";
    }
    if (/use\s*case|вариант[ы]?\s*использования/i.test(t)) {
      return "Use Case — акторы, цели и сценарии взаимодействия с системой (основной и альтернативные потоки), предусловия и постусловия. Для каждого UC описывают шаги, исключения и критерии завершения; используют диаграммы и таблицы сценариев.";
    }
    if (/user\s*stor|юзер\s*стор|пользовательск(ие|ая)\s*истор/i.test(t)) {
      return "User Stories — краткие требования в формате ‘Как [роль], хочу [ценность], чтобы [результат]’ с критериями приемки (GWT) и приоритетом. Stories группируют в EPIC, поддерживают допущения и Dependencies.";
    }
    if (/диаграмм|mermaid|мермейд/i.test(t)) {
      return "Диаграммы процесса удобно фиксировать в mermaid (flowchart LR): этапы, развилки и результаты. Для банковских процессов отражают проверки, эскалации и точки интеграции; одна диаграмма на документ — достаточно для обзора.";
    }
    if (/привет|здравствуй|hello|hi/i.test(t)) {
      return "Здравствуйте. Готов помочь с задачей или ответить на вопрос.";
    }
    if (/платеж|перевод|эквайринг|swift|sepa|карта|visa|mastercard/i.test(t)) {
      return "Платёжный процесс: авторизация, антифрод‑чек, клиринг/сеттлмент. Важные метрики: доля успешных авторизаций, TAT на обработку, chargeback rate. Интеграции: процессинг, антифрод, Core Banking.";
    }
    if (/kyc|идентификац|верификац|санкц|pep|aml|отмывани/i.test(t)) {
      return "KYC/AML: сбор и проверка клиента, санкционные/PEP чек‑листы, оценка риска. Метрики: время онбординга, доля отклонённых, качество матчей. Используются внешние провайдеры, правила комплаенса и аудит.";
    }
    if (/кредит|ипотек|скоринг|pd\b|lgd\b|od\b|заём|займ/i.test(t)) {
      return "Кредитный процесс: заявка → скоринг → решение → выдача → сопровождение. KPI: одобрение, дефолт‑рейт, TAT по этапам. Источники: БКИ, анкетные данные, поведенческие признаки.";
    }
    if (/фрод|мошенн|fraud/i.test(t)) {
      return "Антифрод: правила, модели, real‑time мониторинг. KPI: precision/recall, false positive rate, время реагирования. Необходимы интеграции с каналами, процессингом и Case Management.";
    }
    if (/api|интеграц|esb|шина|kafka|soap|rest/i.test(t)) {
      return "Интеграции: REST/SOAP, события (Kafka), идемпотентность и трассировка. Требования: контракты, версии, ретраи, SLAs на отклик и доступность.";
    }
    if (/счет|баланс|проводк|gl\b|бэк-?офис|core\s*bank/i.test(t)) {
      return "Core Banking: счета, проводки, GL, ночная обработка. Важны согласованность данных, контроль дублирования, восстановление после отказов, аудит операций.";
    }
    if (/канал|мобильн|онлайн|чат\b|бот\b|web\b/i.test(t)) {
      return "Каналы: Web/Mobile, доступность, производительность, безопасность. Метрики: аптайм, среднее время ответа, конверсия по ключевым сценариям.";
    }
    return "Опишите банковский контекст и цель: процесс, роли, входы/выходы, SLA/KPI. По запросу создам диаграмму mermaid и таблицы метрик.";
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    updateKbFromText(userMessage);
    setIsLoading(true);

    const prevAssistantTextPre = messages.filter(m => m.role === 'assistant').map(m => m.content).join("\n\n");
    const preIntentDoc = (
      /(создай|создать|сгенерируй|сгенерировать|оформи|оформить|собери|собрать\s+документ|сделай\s+документ|составь\s+документацию|сделай\s+документацию|документируй|задокументируй|подготовь|подготовить|сформируй|сформировать|дай\b|выдай\b|экспортируй|прикрепи)/i.test(userMessage)
      || /(html|pdf|docx|xlsx)\b/i.test(userMessage)
      || /(диаграмм|mermaid|мермейд)/i.test(userMessage)
      || /(таблиц|таблица)/i.test(userMessage)
      || (/продолжи|продолжай/i.test(userMessage) && isDocLikeText(prevAssistantTextPre))
    );

    try {
      if (!supabase) {
        const mode = preIntentDoc ? "doc" : "chat";
        if (mode === "doc") {
          const finalDoc = buildLocalDoc(userMessage);
          if (!finalDoc.trim()) {
            setMessages(prev => [...prev, { role: "assistant", content: "Требуются данные: укажите цели, роли, входы/выходы, KPI/SLA или контекст." }]);
            return;
          }
          const htmlBlob = generateHtmlBlob(finalDoc);
          const docxBlob = await generateDocxBlob(finalDoc);
          const pdfBlob = await generatePdfBlob(finalDoc);
          const xlsxBlob = generateXlsxBlob(finalDoc);
          updateKbFromText(finalDoc);
          const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
          const createUrl = (b: Blob) => URL.createObjectURL(b);
          const attachments = [
            { type: "html" as const, name: `BA_Document_${stamp}.html`, url: createUrl(htmlBlob) },
            { type: "docx" as const, name: `BA_Document_${stamp}.docx`, url: createUrl(docxBlob) },
            { type: "pdf" as const, name: `BA_Document_${stamp}.pdf`, url: createUrl(pdfBlob) },
            { type: "xlsx" as const, name: `BA_Document_${stamp}.xlsx`, url: createUrl(xlsxBlob) },
          ];
          setMessages(prev => [...prev, { role: "assistant", content: finalDoc, attachments }]);
          return;
        } else {
          const reply = buildLocalChatReply(userMessage);
          setMessages(prev => [...prev, { role: "assistant", content: reply }]);
          return;
        }
      }
      const prevAsk = messages.some(m => m.role === 'assistant' && /Требуются уточнения/i.test(m.content));
      const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      const tokenize = (s: string) => normalize(s).split(' ').filter(Boolean);
      const levenshtein = (a: string, b: string) => {
        const m = a.length, n = b.length;
        const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
          }
        }
        return dp[m][n];
      };
      const containsStem = (text: string, stems: string[], maxDist = 2) => {
        const toks = tokenize(text).slice(0, 80);
        return stems.some(stem => toks.some(tok => tok.includes(stem) || levenshtein(tok, stem) <= maxDist));
      };
      const needStems = ["нужн", "необ", "треб", "надо", "минимум", "обязат", "перечень", "список", "сведен", "данн"];
      const docStems = ["документ", "документац", "тз", "srs", "brd", "frd", "тех", "требован", "артефакт", "use", "user", "истор", "кей" ];
      const proceedVerbPatterns = [
        /создай/i, /создать/i, /сгенерируй/i, /сгенерировать/i, /оформи/i, /оформить/i,
        /сделай/i, /делай/i, /подготовь/i, /подготовить/i, /сформируй/i, /сформировать/i,
        /выдай/i, /дай/i, /выпусти/i, /собери/i, /экспортируй/i, /прикрепи/i, /сгенери/i,
        /собрать\s+документ/i, /сделать\s+документ/i, /документируй/i, /задокументируй/i,
        /продолжи/i, /продолжить/i, /продолжай/i,
        /составь\s+документацию/i, /сделай\s+документацию/i, /оформи\s+документацию/i
      ];
      const proceedQualPatterns = [
        /с\s*тем\s*что\s*(есть|я\s*прислал|отправил|написал)/i,
        /без\s*доп(олнительной)?\s*информации/i,
        /без\s*уточнений/i,
        /без\s*вопросов/i,
        /не\s*буду\s*предоставлять/i,
        /используй\s*то\s*что\s*есть/i,
        /только\s*из\s*моих\s*данных/i,
        /только\s*из\s*предоставленной/i,
        /на\s*основе\s*имеющихся\s*данных/i,
        /на\s*основе\s*моих\s*данных/i,
        /на\s*основе\s*предоставленной\s*информации/i,
        /прямо\s*сейчас/i,
        /как\s*есть/i,
        /исходя\s*из\s*наличия/i,
        /с\s*текущей\s*информацией/i,
        /с\s*текущими\s*данными/i,
        /с\s*имеющимися\s*данными/i,
        /не\s*спрашивай/i,
        /не\s*уточняй/i
      ];
      const negativeCreationPatterns = [/не\s*(создавай|создавать|генерируй|генерировать|делай|делать|оформи|оформляй|оформить|сформируй|сформировать|подготавливай|подготовь)/i];
      const forceProceed = proceedVerbPatterns.some(r => r.test(userMessage)) && proceedQualPatterns.some(r => r.test(userMessage));
      const questionWords = [/\bчто\b/i, /\bкакие\b/i, /\bкакая\b/i, /\bкак\b/i, /\bзачем\b/i, /\bпочему\b/i, /\bсколько\b/i, /\bкогда\b/i, /\bгде\b/i, /\bкто\b/i];
      const isQuestionLike = /\?/i.test(userMessage) || questionWords.some(r => r.test(userMessage.trim()));
      const lastAssistantText = messages.filter(m => m.role === 'assistant').map(m => m.content).join("\n\n");
      const looksDocLike = (txt: string) => {
        const t = String(txt || "");
        const heads = (t.match(/^#{1,6}\s+.+$/gm) || []).length;
        const mermaids = Array.from(t.matchAll(/```\s*mermaid[\s\S]*?```/gi)).length;
        const hasKeyWords = /цели\b|роли\b|входы|выходы|sla|kpi|риски|контроли/i.test(t);
        return heads >= 2 || mermaids >= 1 || hasKeyWords;
      };
      const createDocIntent = (
        proceedVerbPatterns.some(r => r.test(userMessage)) && !negativeCreationPatterns.some(r => r.test(userMessage))
      ) || (
        /продолжи|продолжай/i.test(userMessage) && looksDocLike(lastAssistantText)
      ) || (
        containsStem(userMessage, ["созд", "сформир", "оформ", "подготов", "сдел"], 2) && !containsStem(userMessage, ["не"], 0)
      );
      const missingPhrasePatterns = [
        /^\s*какие\??\s*$/i,
        /какой\s+(информации|данных)\s+не\s*(хватает|доста[её]т)/i,
        /чего\s+не\s*хватает/i,
        /какие\s+данные\s+нужны/i,
        /что\s+именно\s+нужно/i,
        /перечисли\s+что\s+нужно/i,
        /какая\s+информация\s+нужна/i,
        /список\s+(данных|информации|параметров)\s+нужен/i,
        /что\s+именно\s+требуется/i,
        /что\s+требуется\s+для\s+документа/i,
        /что\s+надо\s+для\s+документа/i,
        /что\s+\S*\s*нужно\s+\S*\s*для\s+документации/i,
        /что\s+необходимо\s+для\s+документации/i,
        /что\s+необходимо\s+для\s+документа/i,
        /какие\s+поля\s+нужны/i,
        /какие\s+метрики\s+нужны/i,
        /какие\s+kpi\s+нужны/i,
        /какие\s+разделы\s+нужны/i,
        /какие\s+параметры\s+нужны/i,
        /уточни\s+что\s+нужно/i,
        /уточнение\s+данных/i,
        /поясни\s+что\s+нужно/i,
        /объясни\s+что\s+нужно/i,
        /что\s+нужно\s+уточнить/i,
        /какие\s+вопросы\s+нужно\s+закрыть/i,
        /какие\s+\S*\s+нужны\s+для\s+завершения/i,
        /необходимые\s+данные/i,
        /перечень\s+необходимых\s+данных/i,
        /минимальные\s+данные\s+для\s+документа/i,
        /какой\s+минимум\s+данных\s+нужен/i,
        /какие\s+сведения\s+нужны/i,
        /какой\s+набор\s+данных\s+требуется/i
      ];
      const userFactsQuick = extractFactsFromText(userMessage);
      const hasSomeFacts = [
        userFactsQuick.goals, userFactsQuick.roles, userFactsQuick.inputs, userFactsQuick.outputs,
        userFactsQuick.sla, userFactsQuick.kpi, userFactsQuick.risks, userFactsQuick.controls
      ].some(arr => Array.isArray(arr) && arr.length > 0);
      if (preIntentDoc && !forceProceed && !hasSomeFacts) {
        const ask = buildDataRequest(userMessage, "", kb) || "Уточните минимальные данные: цели, роли или входы/выходы.";
        setMessages(prev => [...prev, { role: "assistant", content: ask }]);
        return;
      }
      const askForMissing = isQuestionLike && !createDocIntent && !forceProceed && !hasSomeFacts && (
        missingPhrasePatterns.some(r => r.test(userMessage)) ||
        (containsStem(userMessage, needStems) && containsStem(userMessage, docStems)) ||
        (/\bкакие\b/i.test(userMessage) && prevAsk)
      );
      if (!createDocIntent && askForMissing) {
        const lastAssistant = messages.filter(m => m.role === 'assistant').map(m => m.content).join("\n\n");
        const ask = buildDataRequest(userMessage, lastAssistant || "", kb);
        if (ask.trim()) { setMessages(prev => [...prev, { role: "assistant", content: ask }]); return; }
        // если нечего уточнять — продолжаем обычный поток
      }
      // Не запрашиваем недостающие данные для обычных вопросов без документного контекста
      const docInstruction = "Ты профессиональный бизнес-аналитик, работающий для банка. Строго сохраняй банковскую тематику: игнорируй несвязанные темы. Создавай только структурированные банковские документы в Markdown. Обязательные разделы: цели процесса, роли, входы/выходы, SLA/KPI, риски и контроли. Для процессов добавляй ровно один блок Mermaid (flowchart LR). Используй компактные горизонтальные таблицы. Не придумывай и не заполняй отсутствующие данные. Если информации недостаточно — запроси недостающее и не добавляй пустые таблицы. Без приветствий и пояснений, только документ.";
      const chatInstruction = "Ты профессиональный бизнес-аналитик для банка. Отвечай кратко и по делу, без генерации документа. Не создавай Markdown‑заголовки, таблицы и блоки кода, если прямо не попросили. Используй только предоставленную информацию, не придумывай отсутствующие данные. Если данных недостаточно — коротко уточни, что нужно.";
      const kbSummary = buildKnowledgeSummary(kb);
      const mode = preIntentDoc ? "doc" : "chat";
      const { data, error } = await supabase.functions.invoke("ba-assistant", {
        body: { messages: [{ role: "system", content: mode === "doc" ? docInstruction : chatInstruction }, ...(kbSummary ? [{ role: "system", content: kbSummary }] : []), ...messages, { role: "user", content: userMessage }], options: { publish, mode, domain: "banking", confluence: { baseUrl: confBaseUrl, spaceKey: confSpaceKey, parentPageId: confParentId, email: confEmail, apiToken: confToken, title: confTitle } } }
      });
      if (error) throw error;
      const resp = String(data.response || "");
      let unwrapped = resp.replace(/^```(?:md|markdown)?\s*[\r\n]?([\s\S]*?)\r?\n```$/i, "$1");
      const isCompleteDoc = (text: string) => {
        const fences = (text.match(/```/g) || []).length;
        if (fences % 2 !== 0) return false;
        const mermaids = Array.from(text.matchAll(/```\s*mermaid[\s\S]*?```/gi)).length;
        if (mermaids !== 1) return false;
        const heads = (text.match(/^#{1,6}\s+.+$/gm) || []).length;
        if (heads < 2) return false;
        if (/\.\.\.$/.test(text)) return false;
        if (/Продолж|Далее|продолж/i.test(text.slice(-80))) return false;
        const hLines = (text.match(/^#{1,6}\s+.*$/gm) || []).map(s => s.toLowerCase());
        const hasGoals = hLines.some(s => /цели\b/.test(s));
        const hasRoles = hLines.some(s => /роли|участники/.test(s));
        const hasInputsOutputs = hLines.some(s => /входы\/?выходы|входы|выходы/.test(s));
        const hasSlaKpi = hLines.some(s => /sla|kpi|sla\/kpi/.test(s));
        const hasRisks = hLines.some(s => /риски/.test(s));
        const hasControls = hLines.some(s => /контроли/.test(s));
        const requiredCount = [hasGoals, hasRoles, hasInputsOutputs, hasSlaKpi, hasRisks, hasControls].filter(Boolean).length;
        if (requiredCount < 5) return false;
        return true;
      };
      const missingSections = (text: string) => {
        const hLines = (text.match(/^#{1,6}\s+.*$/gm) || []).map(s => s.toLowerCase());
        const miss: string[] = [];
        if (!hLines.some(s => /цели\b/.test(s))) miss.push("Цели процесса");
        if (!hLines.some(s => /роли|участники/.test(s))) miss.push("Роли");
        if (!hLines.some(s => /входы\/?выходы|входы|выходы/.test(s))) miss.push("Входы/выходы");
        if (!hLines.some(s => /sla|kpi|sla\/kpi/.test(s))) miss.push("SLA/KPI");
        if (!hLines.some(s => /риски/.test(s))) miss.push("Риски");
        if (!hLines.some(s => /контроли/.test(s))) miss.push("Контроли");
        const mermaids = Array.from(text.matchAll(/```\s*mermaid[\s\S]*?```/gi)).length;
        if (mermaids !== 1) miss.push("Ровно один блок Mermaid (flowchart LR)");
        return miss;
      };
      let attempts = 0;
      while (mode === "doc" && !isCompleteDoc(unwrapped) && attempts < 3) {
        const continuation = [
          { role: "system", content: docInstruction },
          ...messages,
          { role: "user", content: userMessage },
          { role: "assistant", content: unwrapped },
          { role: "user", content: `Продолжи и заверши документ. Не повторяй написанное. Сохраняй банковский контекст. Используй горизонтальные таблицы, избегай вертикальных. Добавь недостающие разделы: ${missingSections(unwrapped).join(', ')}.` },
        ];
        const { data: data2 } = await supabase.functions.invoke("ba-assistant", {
          body: { messages: continuation, options: { publish, domain: "ba", confluence: { baseUrl: confBaseUrl, spaceKey: confSpaceKey, parentPageId: confParentId, email: confEmail, apiToken: confToken, title: confTitle } } }
        });
        const cont = String(data2?.response || "").replace(/^```(?:md|markdown)?\s*[\r\n]?([\s\S]*?)\r?\n```$/i, "$1");
        if (cont.trim()) { unwrapped = unwrapped + "\n\n" + cont; }
        attempts++;
      }
      if (mode === "doc" && !isCompleteDoc(unwrapped)) {
        const continuation = [
          { role: "system", content: docInstruction },
          ...messages,
          { role: "user", content: userMessage },
          { role: "assistant", content: unwrapped },
          { role: "user", content: `Продолжи предыдущий ответ. Не повторяй уже написанное. Заверши документ. Добавь недостающие разделы: ${missingSections(unwrapped).join(', ')}.` },
        ];
        try {
          const { data: data2 } = await supabase.functions.invoke("ba-assistant", {
            body: { messages: continuation, options: { publish, domain: "ba", confluence: { baseUrl: confBaseUrl, spaceKey: confSpaceKey, parentPageId: confParentId, email: confEmail, apiToken: confToken, title: confTitle } } }
          });
          const cont = String(data2?.response || "").replace(/^```(?:md|markdown)?\s*[\r\n]?([\s\S]*?)\r?\n```$/i, "$1");
          if (cont.trim()) { unwrapped = unwrapped + "\n\n" + cont; }
        } catch (_err) { void 0; }
      }
      const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
      const cleaned0 = unwrapped
        .split(/\r?\n/)
        .filter(l => !/^\s*(Пользователь|User|Assistant|Ассистент)\s*:/.test(l))
        .join("\n");
      const cleaned = trimTrailingMeta(cleaned0);
      if (mode === "doc" && (needsMoreData(cleaned) || !hasSomeFacts) && !forceProceed) {
        const ask = buildDataRequest(userMessage, cleaned, kb);
        if (ask.trim()) {
          setMessages(prev => [...prev, { role: "assistant", content: ask }]);
        } else {
          const finalDoc = cleaned;
          const htmlBlob = generateHtmlBlob(finalDoc);
          const docxBlob = await generateDocxBlob(finalDoc);
          const pdfBlob = await generatePdfBlob(finalDoc);
          const xlsxBlob = generateXlsxBlob(finalDoc);
          updateKbFromText(finalDoc);
          const createUrl = (b: Blob) => URL.createObjectURL(b);
          const attachments = [
            { type: "html" as const, name: `BA_Document_${stamp}.html`, url: createUrl(htmlBlob) },
            { type: "docx" as const, name: `BA_Document_${stamp}.docx`, url: createUrl(docxBlob) },
            { type: "pdf" as const, name: `BA_Document_${stamp}.pdf`, url: createUrl(pdfBlob) },
            { type: "xlsx" as const, name: `BA_Document_${stamp}.xlsx`, url: createUrl(xlsxBlob) },
          ];
          setMessages(prev => [...prev, { role: "assistant", content: finalDoc, attachments }]);
        }
      } else if (mode === "doc" && hasSomeFacts) {
        const finalDoc = cleaned;
        const htmlBlob = generateHtmlBlob(finalDoc);
        const docxBlob = await generateDocxBlob(finalDoc);
        const pdfBlob = await generatePdfBlob(finalDoc);
        const xlsxBlob = generateXlsxBlob(finalDoc);
        updateKbFromText(finalDoc);
        const createUrl = (b: Blob) => URL.createObjectURL(b);
        const attachments = [
          { type: "html" as const, name: `BA_Document_${stamp}.html`, url: createUrl(htmlBlob) },
          { type: "docx" as const, name: `BA_Document_${stamp}.docx`, url: createUrl(docxBlob) },
          { type: "pdf" as const, name: `BA_Document_${stamp}.pdf`, url: createUrl(pdfBlob) },
          { type: "xlsx" as const, name: `BA_Document_${stamp}.xlsx`, url: createUrl(xlsxBlob) },
        ];
        setMessages(prev => [...prev, { role: "assistant", content: finalDoc, attachments }]);
      } else if (mode === "doc") {
        const ask = buildDataRequest(userMessage, cleaned, kb) || "Уточните минимальные данные: цели, роли или входы/выходы.";
        setMessages(prev => [...prev, { role: "assistant", content: ask }]);
      } else {
        const concise = stripMeta(trimTrailingMeta(unwrapped)).split(/\r?\n/).slice(0, 40).join("\n");
        setMessages(prev => [...prev, { role: "assistant", content: concise }]);
      }
      if (publish) {
        if (data?.confluence?.published && data?.confluence?.url) {
          toast({ title: "Опубликовано в Confluence", description: String(data.confluence.url) });
        } else {
          toast({ title: "Публикация в Confluence не выполнена", description: String(data?.confluence?.error || "Проверьте параметры окружения"), variant: "destructive" });
        }
      }
    } catch (error) {
      try {
        const mode = preIntentDoc ? "doc" : "chat";
        if (mode === "doc") {
          const finalDoc = buildLocalDoc(userMessage);
          if (!finalDoc.trim()) {
            setMessages(prev => [...prev, { role: "assistant", content: "Требуются данные: укажите цели, роли, входы/выходы, KPI/SLA или контекст." }]);
            return;
          }
          const htmlBlob = generateHtmlBlob(finalDoc);
          const docxBlob = await generateDocxBlob(finalDoc);
          const pdfBlob = await generatePdfBlob(finalDoc);
          const xlsxBlob = generateXlsxBlob(finalDoc);
          updateKbFromText(finalDoc);
          const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");
          const createUrl = (b: Blob) => URL.createObjectURL(b);
          const attachments = [
            { type: "html" as const, name: `BA_Document_${stamp}.html`, url: createUrl(htmlBlob) },
            { type: "docx" as const, name: `BA_Document_${stamp}.docx`, url: createUrl(docxBlob) },
            { type: "pdf" as const, name: `BA_Document_${stamp}.pdf`, url: createUrl(pdfBlob) },
            { type: "xlsx" as const, name: `BA_Document_${stamp}.xlsx`, url: createUrl(xlsxBlob) },
          ];
          setMessages(prev => [...prev, { role: "assistant", content: finalDoc, attachments }]);
        } else {
          const reply = buildLocalChatReply(userMessage);
          setMessages(prev => [...prev, { role: "assistant", content: reply }]);
        }
      } catch {
        toast({ title: "Ошибка", description: "Не удалось обработать локально.", variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
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
                attachments={message.attachments}
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
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
