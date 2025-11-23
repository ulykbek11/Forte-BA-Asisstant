import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { marked } from "https://esm.sh/marked@12.0.2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `Ты — Forte BA Assistant, опытный бизнес-аналитик банковской системы.

Твоя задача — помогать сотрудникам банка в:
1. Сборе и структурировании бизнес-требований
2. Анализе бизнес-процессов
3. Создании аналитических артефактов
4. Формализации требований

При взаимодействии с пользователем:
- Задавай уточняющие вопросы для полного понимания контекста
- Структурируй информацию четко и последовательно
- Используй профессиональную терминологию бизнес-анализа
- Предлагай конкретные решения и рекомендации

Форматы документов, которые ты можешь создавать:
1. Бизнес-требования (цель, описание, scope, бизнес-правила, KPI)
2. Use Case диаграммы и описания
3. User Stories
4. Диаграммы бизнес-процессов (описание в текстовом формате)
5. Лидирующие индикаторы и метрики

Отвечай на русском языке, будь профессиональным и конструктивным.`

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { messages, options } = await req.json()
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured")
    }

    const typePrompt = (() => {
      switch (options?.docType) {
        case "brd":
          return "Сформируй документ бизнес-требований (BRD): Заголовок, Цель, Описание, Scope, Заинтересованные стороны, Бизнес-правила, Нефункциональные требования, Ограничения, Риски, KPI. Возвращай только документ.";
        case "use-case":
          return "Сформируй Use Case документ: акторы, варианты использования, детальные сценарии (основной/альтернативные потоки), предусловия/постусловия, исключения. Добавь блок mermaid для основного потока.";
        case "user-stories":
          return "Сформируй EPIC и набор User Stories. Для каждой Story добавь критерии приемки (GWT), приоритет и ограниченные допущения.";
        case "process":
          return "Сформируй документ описания процесса: назначение, границы, роли, входы/выходы, шаги процесса, бизнес-правила. Обязательно добавь блок ```mermaid``` с диаграммой процесса (flowchart).";
        case "kpi":
          return "Сформируй документ KPI/метрик: цели, карта метрик (определение, формула, периодичность, источники данных), пороги/алерты, визуализация (описание).";
        default:
          return "Сформируй комбинированный документ: ключевые разделы BRD, 2–3 Use Case, 3–5 User Stories, шаги процесса (текст), KPI. Добавь блок mermaid для процесса.";
      }
    })()

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\n" + typePrompt + " Возвращай только документ без лишнего текста." },
          ...(Array.isArray(messages) ? messages : []),
        ],
        temperature: 0.1,
        max_tokens: 3000,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов. Попробуйте позже." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
      throw new Error(`AI Gateway error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    let assistantMessage = data.choices?.[0]?.message?.content ?? ""
    if (!/```mermaid[\s\S]*?```/i.test(assistantMessage)) {
      assistantMessage += `\n\n\n## Диаграмма процесса (Mermaid)\n\n\`\`\`mermaid\nflowchart TD\n  A([Старт]) --> B[Сбор данных]\n  B --> C{Проверка условий}\n  C -- Да --> D[Эскалация]\n  C -- Нет --> E[Авто-обработка]\n  D --> F([Завершение])\n  E --> F\n\`\`\``
    }

    let confluence: { published: boolean; url?: string; pageId?: string; error?: string } | undefined

    if (options?.publish) {
      const CONFLUENCE_BASE_URL = Deno.env.get("CONFLUENCE_BASE_URL")
      const CONFLUENCE_EMAIL = Deno.env.get("CONFLUENCE_EMAIL")
      const CONFLUENCE_API_TOKEN = Deno.env.get("CONFLUENCE_API_TOKEN")
      const CONFLUENCE_SPACE_KEY = Deno.env.get("CONFLUENCE_SPACE_KEY")
      const CONFLUENCE_PARENT_PAGE_ID = Deno.env.get("CONFLUENCE_PARENT_PAGE_ID")

      if (!CONFLUENCE_BASE_URL || !CONFLUENCE_EMAIL || !CONFLUENCE_API_TOKEN || !CONFLUENCE_SPACE_KEY) {
        confluence = { published: false, error: "Confluence окружение не настроено" }
      } else {
        const title = options?.title || `Бизнес-требования — ${new Date().toISOString()}`
        const htmlMarked = marked.parse(assistantMessage)
        const htmlForConfluence = htmlMarked
          .replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_m, code) => {
            const raw = String(code).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
            return `<ac:structured-macro ac:name="mermaid"><ac:plain-text-body><![CDATA[${raw}]]></ac:plain-text-body></ac:structured-macro>`
          })
          .replace(/<pre><code class="language-(?:plantuml|puml|uml)">([\s\S]*?)<\/code><\/pre>/g, (_m, code) => {
            const raw = String(code).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
            return `<ac:structured-macro ac:name="plantuml"><ac:plain-text-body><![CDATA[${raw}]]></ac:plain-text-body></ac:structured-macro>`
          })
        const auth = "Basic " + btoa(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`)
        const body: Record<string, unknown> = {
          type: "page",
          title,
          space: { key: CONFLUENCE_SPACE_KEY },
          body: { storage: { value: htmlForConfluence, representation: "storage" } },
        }
        if (CONFLUENCE_PARENT_PAGE_ID) {
          body.ancestors = [{ id: CONFLUENCE_PARENT_PAGE_ID }]
        }

        const createPage = await fetch(`${CONFLUENCE_BASE_URL}/rest/api/content`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        if (!createPage.ok) {
          const t = await createPage.text()
          confluence = { published: false, error: `Confluence error ${createPage.status} ${t}` }
        } else {
          const j = await createPage.json()
          const url = j?._links?.base && j?._links?.webui ? `${j._links.base}${j._links.webui}` : j?._links?.self
          confluence = { published: true, url, pageId: j?.id }
        }
      }
    }

    return new Response(
      JSON.stringify({ response: assistantMessage, confluence }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})