import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import JSZip from "jszip";
import { generateArtifacts } from "./generator.js";
import { getMissingFields, validateDataSchema } from "./validation.js";
import { uploadArtifactsToConfluence } from "./confluence.js";
import crypto from "node:crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "2mb" }));
const cache = new Map();
const order = [];
const MAX_CACHE = 100;

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/generate", async (req, res) => {
  try {
    const inputFormat = req.body?.inputFormat || (req.is("application/json") ? "json" : "text");
    const rawData = inputFormat === "text" ? { description: req.body?.text || "" } : (req.body?.data || req.body || {});
    const missing = getMissingFields(rawData);
    const validationErrors = validateDataSchema(rawData);
    const uploadRequested = req.body?.options?.uploadToConfluence || false;
    const returnZip = req.body?.options?.returnZip || false;
    const useCache = req.body?.options?.cache !== false && !uploadRequested;
    const key = crypto.createHash("sha1").update(JSON.stringify(rawData)).digest("hex");

    let artifacts = null;
    let files = null;
    if (useCache && cache.has(key)) {
      const cached = cache.get(key);
      artifacts = cached.artifacts;
      files = cached.files;
    } else {
      artifacts = generateArtifacts(rawData);
      files = [
        { name: "BusinessRequirements.md", type: "text/markdown", content: artifacts.businessRequirementsMd },
        { name: "UseCases.md", type: "text/markdown", content: artifacts.useCasesMarkdown },
        { name: "UserStories.md", type: "text/markdown", content: artifacts.userStoriesMarkdown },
        { name: "ProcessDiagram.mmd", type: "text/mermaid", content: artifacts.processDiagramMermaid },
        { name: "ProcessDiagram.puml", type: "text/plain", content: artifacts.processDiagramPlantUML },
        { name: "KPI.md", type: "text/markdown", content: artifacts.kpiMarkdown }
      ];
      if (useCache) {
        cache.set(key, { artifacts, files });
        order.push(key);
        if (order.length > MAX_CACHE) {
          const oldest = order.shift();
          cache.delete(oldest);
        }
      }
    }

    let confluence = null;
    const cfg = req.body?.confluence || null;
    if (uploadRequested && cfg) {
      try {
        const uploadResult = await uploadArtifactsToConfluence(artifacts, cfg);
        confluence = { uploaded: true, pageId: uploadResult.pageId, url: uploadResult.url };
      } catch (e) {
        confluence = { uploaded: false, error: e?.message || String(e) };
      }
    }

    let zip = null;
    if (returnZip) {
      const zipBuilder = new JSZip();
      files.forEach(f => zipBuilder.file(f.name, f.content));
      const zipped = await zipBuilder.generateAsync({ type: "base64", compression: "DEFLATE" });
      zip = { base64: zipped, filename: "artifacts.zip" };
    }

    res.json({ ok: true, missingFields: missing, validationErrors, artifacts, files, zip, confluence });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {});
app.use((err, req, res, next) => {
  res.status(400).json({ ok: false, error: err?.message || String(err) });
});