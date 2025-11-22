function normalizeArray(arr) {
  if (!arr) return [];
  if (Array.isArray(arr)) return arr.filter(Boolean).map(String);
  return String(arr).split(/\n|,|;|\|/).map(s => s.trim()).filter(Boolean);
}

function mdSection(title, content) {
  const body = Array.isArray(content) ? content.join("\n") : content;
  return `# ${title}\n\n${body}\n`;
}

function buildBRD(data) {
  const title = data.title || data.initiativeTitle || "Инициатива";
  const system = data.systemName || "Система";
  const summary = data.summary || data.description || "Описание отсутствует";
  const goals = normalizeArray(data.objectives || data.goals);
  const stakeholders = normalizeArray(data.stakeholders);
  const scope = normalizeArray(data.scope);
  const outOfScope = normalizeArray(data.outOfScope);
  const assumptions = normalizeArray(data.assumptions);
  const constraints = normalizeArray(data.constraints);
  const risks = normalizeArray(data.risks);
  const fr = normalizeArray(data.functionalRequirements);
  const nfr = normalizeArray(data.nonFunctionalRequirements);
  const ac = normalizeArray(data.acceptanceCriteria);
  const metrics = normalizeArray(data.successMetrics);

  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Система: ${system}`);
  lines.push("");
  lines.push(summary);
  lines.push("");
  if (goals.length) {
    lines.push("## Цели");
    goals.forEach(g => lines.push(`- ${g}`));
    lines.push("");
  }
  if (stakeholders.length) {
    lines.push("## Заинтересованные стороны");
    stakeholders.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (scope.length) {
    lines.push("## Область действия");
    scope.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (outOfScope.length) {
    lines.push("## Вне области");
    outOfScope.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (assumptions.length) {
    lines.push("## Допущения");
    assumptions.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (constraints.length) {
    lines.push("## Ограничения");
    constraints.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (risks.length) {
    lines.push("## Риски");
    risks.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (fr.length) {
    lines.push("## Функциональные требования");
    fr.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (nfr.length) {
    lines.push("## Нефункциональные требования");
    nfr.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (ac.length) {
    lines.push("## Критерии приемки");
    ac.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  if (metrics.length) {
    lines.push("## Метрики успеха");
    metrics.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
  return lines.join("\n");
}

function buildUseCases(data) {
  const actors = normalizeArray(data.actors);
  const goals = normalizeArray(data.objectives || data.goals);
  const steps = normalizeArray(data.processSteps);
  const list = [];
  if (goals.length) {
    goals.forEach((g, i) => {
      const actor = actors[i % (actors.length || 1)] || "Пользователь";
      list.push({
        name: `UC${i + 1} ${g}`,
        primaryActor: actor,
        preconditions: ["Система доступна"],
        mainFlow: steps.length ? steps : ["Пользователь инициирует процесс", "Система обрабатывает запрос", "Результат отображается"],
        postconditions: ["Цель достигнута"]
      });
    });
  } else if (steps.length) {
    const actor = actors[0] || "Пользователь";
    list.push({
      name: `UC Основной процесс`,
      primaryActor: actor,
      preconditions: ["Система доступна"],
      mainFlow: steps,
      postconditions: ["Процесс завершен"]
    });
  } else {
    list.push({
      name: "UC По умолчанию",
      primaryActor: actors[0] || "Пользователь",
      preconditions: ["Система доступна"],
      mainFlow: ["Пользователь инициирует процесс", "Система обрабатывает запрос", "Результат отображается"],
      postconditions: ["Цель достигнута"]
    });
  }
  return list;
}

function useCasesToMarkdown(useCases) {
  const lines = [];
  useCases.forEach(uc => {
    lines.push(`## ${uc.name}`);
    lines.push(`Актор: ${uc.primaryActor}`);
    if (uc.preconditions?.length) {
      lines.push("Предусловия:");
      uc.preconditions.forEach(p => lines.push(`- ${p}`));
    }
    lines.push("Основной поток:");
    uc.mainFlow.forEach(s => lines.push(`1. ${s}`));
    if (uc.postconditions?.length) {
      lines.push("Постусловия:");
      uc.postconditions.forEach(p => lines.push(`- ${p}`));
    }
    lines.push("");
  });
  return lines.join("\n");
}

function buildUserStories(data) {
  const actors = normalizeArray(data.actors);
  const goals = normalizeArray(data.objectives || data.goals);
  const fr = normalizeArray(data.functionalRequirements);
  const steps = normalizeArray(data.processSteps);
  const stories = [];
  const baseActor = actors[0] || "Пользователь";
  fr.forEach(f => stories.push(`Как ${baseActor}, я хочу ${f}, чтобы достичь цели`));
  if (!fr.length && steps.length) {
    steps.forEach(s => stories.push(`Как ${baseActor}, я хочу выполнить шаг: ${s}, чтобы завершить процесс`));
  }
  if (!fr.length && !steps.length && goals.length) {
    goals.forEach(g => stories.push(`Как ${baseActor}, я хочу ${g}, чтобы получить пользу`));
  }
  if (!stories.length) stories.push(`Как ${baseActor}, я хочу пользоваться системой, чтобы достигать целей`);
  return stories;
}

function userStoriesToMarkdown(stories) {
  const lines = [];
  lines.push("## User Stories");
  stories.forEach(s => lines.push(`- ${s}`));
  lines.push("");
  return lines.join("\n");
}

function buildMermaid(data) {
  const title = data.title || "Процесс";
  const steps = normalizeArray(data.processSteps);
  const nodes = steps.length ? steps : ["Старт", "Действие", "Завершение"];
  const lines = [];
  lines.push("flowchart TD");
  const startId = "start";
  lines.push(`${startId}([${title}])`);
  for (let i = 0; i < nodes.length; i++) {
    const id = `n${i}`;
    const label = String(nodes[i]).replace(/[\[\]{}"']/g, " ");
    lines.push(`${id}([${label}])`);
  }
  const endId = "end";
  lines.push(`${endId}([Конец])`);
  lines.push(`${startId}-->n0`);
  for (let i = 0; i < nodes.length - 1; i++) {
    lines.push(`n${i}-->n${i + 1}`);
  }
  lines.push(`n${nodes.length - 1}-->${endId}`);
  return lines.join("\n");
}

function buildPlantUML(data) {
  const steps = normalizeArray(data.processSteps);
  const nodes = steps.length ? steps : ["Старт", "Действие", "Завершение"];
  const lines = [];
  lines.push("@startuml");
  lines.push("start");
  nodes.forEach(n => {
    const label = String(n).replace(/;/g, ",");
    lines.push(`: ${label};`);
  });
  lines.push("stop");
  lines.push("@enduml");
  return lines.join("\n");
}

function buildKPI(data) {
  const metrics = normalizeArray(data.successMetrics);
  const result = metrics.length ? metrics : [
    "Время цикла",
    "Пропускная способность",
    "Процент ошибок",
    "Уровень удовлетворенности пользователей",
    "Доля автоматизации"
  ];
  return result;
}

function listToMarkdown(title, items) {
  const lines = [];
  lines.push(`## ${title}`);
  items.forEach(i => lines.push(`- ${i}`));
  lines.push("");
  return lines.join("\n");
}

export function generateArtifacts(data) {
  const businessRequirementsMd = buildBRD(data);
  const useCases = buildUseCases(data);
  const useCasesMarkdown = useCasesToMarkdown(useCases);
  const userStories = buildUserStories(data);
  const userStoriesMarkdown = userStoriesToMarkdown(userStories);
  const processDiagramMermaid = buildMermaid(data);
  const processDiagramPlantUML = buildPlantUML(data);
  const kpi = buildKPI(data);
  const kpiMarkdown = listToMarkdown("KPI", kpi);
  return {
    businessRequirementsMd,
    useCases,
    useCasesMarkdown,
    userStories,
    userStoriesMarkdown,
    processDiagramMermaid,
    processDiagramPlantUML,
    kpi,
    kpiMarkdown
  };
}