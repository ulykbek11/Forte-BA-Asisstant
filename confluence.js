import axios from "axios";
import { marked } from "marked";

function ensureBaseUrl(url) {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function uploadArtifactsToConfluence(artifacts, cfg) {
  const baseUrl = ensureBaseUrl(cfg.baseUrl);
  const spaceKey = cfg.spaceKey;
  const parentId = cfg.parentPageId;
  const email = cfg.email;
  const token = cfg.apiToken;
  const title = cfg.title || "Business Requirements";
  const html = marked.parse(
    `# ${title}\n\n` +
    artifacts.businessRequirementsMd +
    "\n\n" +
    "## Use Cases\n\n" +
    artifacts.useCasesMarkdown +
    "\n\n" +
    "## User Stories\n\n" +
    artifacts.userStoriesMarkdown +
    "\n\n" +
    "## Диаграмма (Mermaid)\n\n" +
    "```mermaid\n" + artifacts.processDiagramMermaid + "\n```" +
    "\n\n" +
    "## Диаграмма (PlantUML)\n\n" +
    "```plantuml\n" + artifacts.processDiagramPlantUML + "\n```" +
    "\n\n" +
    artifacts.kpiMarkdown
  );
  const body = {
    type: "page",
    title,
    space: { key: spaceKey },
    ancestors: parentId ? [{ id: String(parentId) }] : [],
    body: { storage: { value: html, representation: "storage" } }
  };
  const url = `${baseUrl}/rest/api/content`;
  const resp = await axios.post(url, body, { auth: { username: email, password: token } });
  const pageId = resp.data?.id;
  const pageUrl = `${baseUrl}/pages/${pageId}`;
  return { pageId, url: pageUrl };
}