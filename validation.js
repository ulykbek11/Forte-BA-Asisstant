function normalizeArray(arr) {
  if (!arr) return [];
  if (Array.isArray(arr)) return arr.filter(Boolean).map(String);
  return String(arr).split(/\n|,|;|\|/).map(s => s.trim()).filter(Boolean);
}

import Ajv from "ajv";

export function getMissingFields(data) {
  const missing = [];
  if (!data.title && !data.initiativeTitle) {
    missing.push({ field: "title", prompt: "Укажите название инициативы", example: "Оптимизация обработки заявок" });
  }
  if (!data.description && !data.summary) {
    missing.push({ field: "description", prompt: "Добавьте краткое описание", example: "Сокращение времени обработки заявки до 2 минут" });
  }
  const actors = normalizeArray(data.actors);
  if (!actors.length) {
    missing.push({ field: "actors", prompt: "Кто участвует в процессе?", example: "Оператор, Клиент, Система" });
  }
  const steps = normalizeArray(data.processSteps);
  if (steps.length < 2) {
    missing.push({ field: "processSteps", prompt: "Опишите ключевые шаги процесса", example: "Получение заявки, Проверка данных, Принятие решения, Уведомление" });
  }
  const fr = normalizeArray(data.functionalRequirements);
  if (!fr.length) {
    missing.push({ field: "functionalRequirements", prompt: "Перечислите функциональные требования", example: "Регистрация, Валидация, Маршрутизация" });
  }
  const nfr = normalizeArray(data.nonFunctionalRequirements);
  if (!nfr.length) {
    missing.push({ field: "nonFunctionalRequirements", prompt: "Добавьте нефункциональные требования", example: "Доступность 99.9%, Время ответа < 1с" });
  }
  const ac = normalizeArray(data.acceptanceCriteria);
  if (!ac.length) {
    missing.push({ field: "acceptanceCriteria", prompt: "Определите критерии приемки", example: "Все поля обязательные, Ошибки логируются" });
  }
  const sm = normalizeArray(data.successMetrics);
  if (!sm.length) {
    missing.push({ field: "successMetrics", prompt: "Задайте метрики успеха", example: "Время обработки < 2 мин, Ошибок < 1%" });
  }
  return missing;
}

export function validateDataSchema(data) {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  const schema = {
    type: "object",
    properties: {
      title: { type: "string", minLength: 2 },
      initiativeTitle: { type: "string" },
      description: { type: "string", minLength: 5 },
      summary: { type: "string" },
      systemName: { type: "string" },
      objectives: { type: "array", items: { type: "string" } },
      stakeholders: { type: "array", items: { type: "string" } },
      actors: { type: "array", items: { type: "string" } },
      processSteps: { type: "array", items: { type: "string" }, minItems: 2 },
      functionalRequirements: { type: "array", items: { type: "string" } },
      nonFunctionalRequirements: { type: "array", items: { type: "string" } },
      acceptanceCriteria: { type: "array", items: { type: "string" } },
      successMetrics: { type: "array", items: { type: "string" } }
    },
    additionalProperties: true
  };
  const validate = ajv.compile(schema);
  const ok = validate(data);
  if (ok) return [];
  return (validate.errors || []).map(e => ({ field: (e.instancePath || "").replace(/^\//, ""), message: e.message }));
}