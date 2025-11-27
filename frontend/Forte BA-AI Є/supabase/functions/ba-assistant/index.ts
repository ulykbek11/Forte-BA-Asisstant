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
- Всегда сохраняй банковский контекст. Игнорируй бытовые и несвязанные темы; при их наличии перефразируй запрос и приведи банковский эквивалент либо вежливо попроси уточнить банковские детали.

Форматы документов, которые ты можешь создавать:
1. Бизнес-требования (цель, описание, scope, бизнес-правила, KPI)
2. Use Case диаграммы и описания
3. User Stories
4. Диаграммы бизнес-процессов (описание в текстовом формате)
5. Лидирующие индикаторы и метрики

Отвечай на русском языке, будь профессиональным и конструктивным.`

const SYSTEM_CHAT_PROMPT = `Ты — Forte BA Assistant, профессиональный бизнес-аналитик в банковском контексте.

Отвечай кратко и по делу. Не создавай Markdown‑документы, заголовки, таблицы, блоки кода и диаграммы, если это прямо не попросили. Давай ответ в одном‑двух абзацах.

Всегда сохраняй банковскую тематику и терминологию.`

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { messages, options } = await req.json()
    const isChat = String(options?.mode || "").toLowerCase() === "chat"
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured")
    }

    const typePrompt = (() => {
      if (isChat) return "";
      switch (options?.docType) {
        case "brd":
          return "Сформируй полный документ бизнес-требований (BRD) в Markdown: обязательно включи Заголовок, Цель, Описание, Scope, Заинтересованные стороны, Бизнес-правила, Нефункциональные требования, Ограничения, Риски, KPI. Используй таблицы. Добавь одну mermaid-диаграмму банковского процесса (flowchart LR). Возвращай только документ.";
        case "use-case":
          return "Сформируй Use Case документ: акторы, варианты использования, детальные сценарии (основной/альтернативные потоки), предусловия/постусловия, исключения. Используй таблицы для сценариев. Добавь одну mermaid-диаграмму основного потока банковской функции (flowchart LR). Возвращай только документ.";
        case "user-stories":
          return "Сформируй EPIC и набор User Stories в табличном формате. Для каждой Story обязательно добавь критерии приемки (GWT), приоритет и допущения. Используй Markdown таблицы. Возвращай только документ в банковском контексте.";
        case "process":
          return "Сформируй документ описания банковского процесса: назначение, границы, роли, входы/выходы, подробные шаги процесса, бизнес-правила. Обязательно добавь одну mermaid-диаграмму процесса (flowchart LR). Используй списки и таблицы. Возвращай только документ.";
        case "kpi":
          return "Сформируй документ KPI/метрик для банковского продукта/процесса: цели, карта метрик в табличном формате (определение, формула, периодичность, источники данных), пороги/алерты, визуализация. Используй Markdown таблицы. Возвращай только документ.";
        default:
          return "Сформируй полный комбинированный документ в банковском контексте: ключевые разделы BRD, 2–3 Use Case в таблицах, 3–5 User Stories с критериями приемки, подробные шаги процесса (текст), KPI в таблице. Добавь одну mermaid-диаграмму банковского процесса (flowchart LR). Используй Markdown форматирование. Возвращай только документ.";
      }
    })()

    const domainPrompt = (() => {
      const d = String(options?.domain || "").toLowerCase();
      if (d === "ba" || d === "bank" || d === "banking") {
        return "Всегда сохраняй банковскую тематику. Запрещено генерировать бытовые, кулинарные, развлекательные или иные несвязанные процессы. При отсутствии контекста — запроси банковские детали (продукт, процесс, система, роли).";
      }
      return "";
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
          { role: "system", content: (isChat ? SYSTEM_CHAT_PROMPT : SYSTEM_PROMPT + "\n\n" + typePrompt) + (domainPrompt ? ("\n\n" + domainPrompt) : "") + (isChat ? "" : " Возвращай только документ без лишнего текста.") },
          ...(Array.isArray(messages) ? messages : []),
        ],
        temperature: isChat ? 0.3 : 0.1,
        max_tokens: isChat ? 2000 : 8000,
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
    
    if (!isChat && assistantMessage.length < 500) {
      const sections = []
      if (!assistantMessage.includes("## ")) {
        sections.push("## Основные положения\n\n[Содержание документа...]\n")
      }
      if (!assistantMessage.includes("### ")) {
        sections.push("### Детали реализации\n\n[Детали...]\n")
      }
      if (sections.length > 0) {
        assistantMessage += "\n\n" + sections.join("\n")
      }
    }
    
    if (!isChat && !/```mermaid[\s\S]*?```/i.test(assistantMessage) && !/```plantuml[\s\S]*?```/i.test(assistantMessage)) {
      let diagramContext = "Основной банковский процесс"
      if (options?.docType === "brd") diagramContext = "Сбор и согласование требований банковского продукта"
      else if (options?.docType === "use-case") diagramContext = "Основной поток банковской функции"
      else if (options?.docType === "user-stories") diagramContext = "Разработка фичи банковского сервиса"
      else if (options?.docType === "process") diagramContext = "Ключевой банковский процесс"
      else if (options?.docType === "kpi") diagramContext = "Сбор и анализ банковских метрик"
      
      assistantMessage += `\n\n\n## Диаграмма процесса: ${diagramContext}\n\n\`\`\`mermaid\nflowchart LR\n  Start([Начало]) --> Input[Ввод данных]\n  Input --> Validate{Валидация}\n  Validate -- Успешно --> Process[Обработка]\n  Validate -- Ошибка --> Error[Обработка ошибки]\n  Process --> Result[Результат]\n  Error --> Result\n  Result --> End([Завершение])\n\`\`\``
    }

    const enforceBankDomain = () => {
      const s = assistantMessage.toLowerCase()
      const hasBank = /(банк|кредит|счет|счёт|платеж|платёж|карта|транзакц|депозит|вклад|ипотек|swift|iban|pos|эквайр|перевод|касс|инкасс|скоринг|лимит|комисси|контрагент|клиент|договор|заявка|aml|kyc)/i.test(s)
      const hasOff = /(яичниц|яйц|кулинар|рецепт|сковород|жарка|готовк|лук|масл|повар|еда|кухн|пицц|бургер|чай|кофе)/i.test(s)
      const d = String(options?.domain || "").toLowerCase()
      return (d === "ba" || d === "bank" || d === "banking") && (!hasBank || hasOff)
    }

    if (!isChat && enforceBankDomain()) {
      const response2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT + "\n\n" + typePrompt + "\n\nСтрого банковская тематика. Перепиши документ в банковском контексте, заменив любые бытовые примеры на банковские." },
            ...(Array.isArray(messages) ? messages : []),
          ],
          temperature: 0.1,
          max_tokens: 8000,
        }),
      })
      if (response2.ok) {
        const data2 = await response2.json()
        assistantMessage = data2.choices?.[0]?.message?.content ?? assistantMessage
      }
    }

    let confluence: { published: boolean; url?: string; pageId?: string; error?: string } | undefined

    if (!isChat && options?.publish) {
      const CONFLUENCE_BASE_URL = options?.confluence?.baseUrl || Deno.env.get("CONFLUENCE_BASE_URL")
      const CONFLUENCE_EMAIL = options?.confluence?.email || Deno.env.get("CONFLUENCE_EMAIL")
      const CONFLUENCE_API_TOKEN = options?.confluence?.apiToken || Deno.env.get("CONFLUENCE_API_TOKEN")
      const CONFLUENCE_SPACE_KEY = options?.confluence?.spaceKey || Deno.env.get("CONFLUENCE_SPACE_KEY")
      const CONFLUENCE_PARENT_PAGE_ID = options?.confluence?.parentPageId || Deno.env.get("CONFLUENCE_PARENT_PAGE_ID")

      if (!CONFLUENCE_BASE_URL || !CONFLUENCE_EMAIL || !CONFLUENCE_API_TOKEN || !CONFLUENCE_SPACE_KEY) {
        confluence = { published: false, error: "Confluence окружение не настроено" }
      } else {
        const title = options?.confluence?.title || `Бизнес-требования — ${new Date().toISOString()}`
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
