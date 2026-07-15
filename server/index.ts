import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { incidents } from "./demo-data.js";
import { resolveDataHubConnection } from "./datahub-config.js";
import { DataHubMcpClient } from "./datahub-mcp.js";
import { createFixtureMcpServer } from "./mcp-fixture.js";
import { analyzeIncidentViaMcp } from "./mcp-analysis.js";
import { publishIncidentMemory } from "./incident-memory.js";
import type { AnalysisResult, Incident, PublishResult } from "../src/types.js";

try {
  process.loadEnvFile();
} catch {
  // `.env` is optional; the deterministic demo works without credentials.
}

const app = express();
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(currentDir, "../dist");
const fixtureMcpUrl = `http://127.0.0.1:${port}/mcp/fixture`;
const analysisCache = new Map<string, AnalysisResult>();
const publishedMemories = new Map<string, PublishResult>();

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

app.use(express.json({ limit: "1mb" }));

const connection = () => {
  const resolved = resolveDataHubConnection();
  const mutationEnabled = Boolean(resolved && process.env.DATAHUB_MCP_MUTATIONS === "true");
  return {
    mode: resolved ? "datahub-mcp" : "mcp-fixture",
    label: resolved?.label ?? "Local MCP fixture",
    endpointConfigured: Boolean(resolved),
    transport: resolved?.transport ?? "http",
    mutationEnabled,
  };
};

app.post("/mcp/fixture", async (req, res) => {
  const server = createFixtureMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Fixture MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal MCP error" }, id: null });
    }
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
});

app.get("/mcp/fixture", (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

app.delete("/mcp/fixture", (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "lineagepatch-api", connection: connection() });
});

app.get("/api/bootstrap", (_req, res) => {
  res.json({ incidents, connection: connection() });
});

app.post("/api/incidents", (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(4).max(90),
    summary: z.string().trim().min(8).max(240),
    source: z.enum([
      "postgres.order_entry.customers",
      "postgres.order_entry.orders",
      "postgres.order_entry.addresses",
    ]),
    severity: z.enum(["critical", "high", "medium"]),
    owner: z.string().trim().min(2).max(60),
    signal: z.string().trim().min(3).max(90),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Complete every incident field with a valid value." });
  }

  const template = incidents.find((item) => item.source === parsed.data.source);
  if (!template) return res.status(400).json({ error: "The selected source is not available." });

  const nextNumber = Math.max(...incidents.map((item) => Number(item.id.replace("INC-", "")) || 0)) + 1;
  const incident: Incident = {
    id: `INC-${nextNumber}`,
    title: parsed.data.title,
    summary: parsed.data.summary,
    source: parsed.data.source,
    severity: parsed.data.severity,
    status: "ready",
    detectedAt: new Date().toISOString(),
    assetUrn: template.assetUrn,
    owner: parsed.data.owner,
    signal: parsed.data.signal,
  };

  incidents.unshift(incident);
  return res.status(201).json(incident);
});

app.post("/api/analyze", async (req, res) => {
  const parsed = z.object({ incidentId: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "A valid incidentId is required." });
  }

  const incident = incidents.find((item) => item.id === parsed.data.incidentId);
  if (!incident) return res.status(404).json({ error: "Incident not found." });

  const resolved = resolveDataHubConnection();
  try {
    let result: AnalysisResult;
    if (resolved) {
      try {
        result = await withTimeout(
          analyzeIncidentViaMcp(
            incident,
            resolved.config,
            "datahub-mcp",
            process.env.DATAHUB_MCP_MUTATIONS === "true",
          ),
          3500,
          "Live DataHub did not respond within 3.5 seconds.",
        );
      } catch (error) {
        console.warn("Live DataHub analysis unavailable; using the MCP fixture.", error instanceof Error ? error.message : error);
        result = await analyzeIncidentViaMcp(
          incident,
          { transport: "http", url: fixtureMcpUrl },
          "mcp-fixture",
        );
        result.fallbackReason = "Live DataHub was unavailable, so this run used the deterministic MCP fixture.";
      }
    } else {
      result = await analyzeIncidentViaMcp(
        incident,
        { transport: "http", url: fixtureMcpUrl },
        "mcp-fixture",
      );
    }
    analysisCache.set(incident.id, result);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP analysis failed";
    return res.status(502).json({ error: message });
  }
});

app.post("/api/incidents/:incidentId/publish", async (req, res) => {
  const parsed = z.object({ approved: z.literal(true) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Explicit approval is required." });

  const incident = incidents.find((item) => item.id === req.params.incidentId);
  if (!incident) return res.status(404).json({ error: "Incident not found." });

  const existing = publishedMemories.get(incident.id);
  if (existing) return res.json(existing);

  const resolved = resolveDataHubConnection();
  if (!resolved || process.env.DATAHUB_MCP_MUTATIONS !== "true") {
    return res.status(403).json({ error: "DataHub write-back is disabled for this server." });
  }

  const analysis = analysisCache.get(incident.id);
  if (!analysis || analysis.provider !== "datahub-mcp") {
    return res.status(409).json({ error: "Run a live DataHub analysis before publishing." });
  }

  try {
    const published = await publishIncidentMemory(analysis, resolved.config);
    publishedMemories.set(incident.id, published);
    return res.json(published);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DataHub write-back failed";
    return res.status(502).json({ error: message });
  }
});

app.post("/api/datahub/test", async (_req, res) => {
  const resolved = resolveDataHubConnection();
  const config = resolved?.config ?? { transport: "http" as const, url: fixtureMcpUrl };
  const client = new DataHubMcpClient(config);
  try {
    const tools = await withTimeout(client.connect(), 3500, "The configured DataHub endpoint did not respond within 3.5 seconds.");
    return res.json({
      ok: true,
      endpoint: config.transport === "stdio" ? "local stdio" : new URL(config.url).host,
      provider: resolved ? "datahub-mcp" : "mcp-fixture",
      tools: tools.tools.map((tool) => tool.name),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MCP connection error";
    return res.status(502).json({ error: message });
  } finally {
    await client.close().catch(() => undefined);
  }
});

app.use(express.static(distDir));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  return res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, host, () => {
  console.log(`LineagePatch API listening on http://${host}:${port}`);
});
