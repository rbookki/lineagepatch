import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { createDemoAnalysis, incidents } from "./demo-data.js";

function findIncident(urn: string) {
  return incidents.find((incident) => incident.assetUrn === urn) ?? incidents[0];
}

function schemaFieldsFor(urn: string) {
  const incident = findIncident(urn);
  if (incident.id === "INC-2045") {
    return [
      { fieldPath: "order_id", nativeDataType: "STRING", nullable: false },
      { fieldPath: "customer_id", nativeDataType: "STRING", nullable: false },
      { fieldPath: "order_total", nativeDataType: "NUMERIC", nullable: false },
      { fieldPath: "loaded_at", nativeDataType: "TIMESTAMP", nullable: false },
    ];
  }
  if (incident.id === "INC-2039") {
    return [
      { fieldPath: "payment_id", nativeDataType: "STRING", nullable: false },
      { fieldPath: "cardholder_email", nativeDataType: "STRING", nullable: true, glossaryTerms: [] },
      { fieldPath: "amount", nativeDataType: "DECIMAL", nullable: false },
    ];
  }
  return [
    { fieldPath: "customer_id", nativeDataType: "VARCHAR", nullable: false },
    { fieldPath: "cust_email", nativeDataType: "VARCHAR", nullable: true, tags: ["PII"] },
    { fieldPath: "customer_status", nativeDataType: "VARCHAR", nullable: true },
    { fieldPath: "updated_at", nativeDataType: "TIMESTAMP", nullable: false },
  ];
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

export function createFixtureMcpServer() {
  const server = new McpServer({
    name: "lineagepatch-datahub-fixture",
    version: "0.1.0",
  });

  server.registerTool("get_entities", {
    title: "Get DataHub entities",
    description: "Get detailed information about one or more entities by DataHub URN.",
    inputSchema: {
      urns: z.union([z.string(), z.array(z.string())]),
    },
    annotations: { readOnlyHint: true },
  }, async ({ urns }) => {
    const requested = Array.isArray(urns) ? urns : [urns];
    const entities = requested.map((urn) => {
      const incident = findIncident(urn);
      return {
        urn,
        type: "DATASET",
        name: incident.source.split(".").at(-1),
        platform: incident.source.split(".")[0],
        owners: [{ name: incident.owner, type: "TECHNICAL_OWNER" }],
        assertions: [{ type: "DATA_CONTRACT", signal: incident.signal }],
      };
    });
    return textResult(Array.isArray(urns) ? entities : entities[0]);
  });

  server.registerTool("list_schema_fields", {
    title: "List schema fields",
    description: "List schema fields for a DataHub dataset with pagination.",
    inputSchema: {
      urn: z.string(),
      keywords: z.array(z.string()).optional(),
      limit: z.number().int().positive().default(100),
      offset: z.number().int().nonnegative().default(0),
    },
    annotations: { readOnlyHint: true },
  }, async ({ urn, keywords, limit, offset }) => {
    let fields = schemaFieldsFor(urn);
    if (keywords?.length) {
      fields = fields.filter((field) => keywords.some((keyword) => field.fieldPath.toLowerCase().includes(keyword.toLowerCase())));
    }
    return textResult({
      urn,
      fields: fields.slice(offset, offset + limit),
      totalFields: fields.length,
      returned: Math.min(fields.length, limit),
      remainingCount: Math.max(0, fields.length - offset - limit),
      matchingCount: keywords?.length ? fields.length : null,
      offset,
    });
  });

  server.registerTool("get_lineage", {
    title: "Get lineage",
    description: "Get upstream or downstream DataHub lineage for an entity.",
    inputSchema: {
      urn: z.string(),
      column: z.string().optional(),
      query: z.string().optional(),
      filter: z.string().optional(),
      upstream: z.boolean().default(true),
      max_hops: z.number().int().positive().default(1),
      max_results: z.number().int().positive().default(30),
      offset: z.number().int().nonnegative().default(0),
    },
    annotations: { readOnlyHint: true },
  }, async ({ urn, upstream, max_hops }) => {
    const incident = findIncident(urn);
    const analysis = createDemoAnalysis(incident);
    return textResult({
      direction: upstream ? "UPSTREAM" : "DOWNSTREAM",
      maxHops: max_hops,
      nodes: analysis.nodes,
      edges: analysis.edges,
      blastRadius: analysis.blastRadius,
      explanation: analysis.explanation,
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
    });
  });

  server.registerTool("get_dataset_queries", {
    title: "Get dataset queries",
    description: "Get SQL queries associated with a DataHub dataset or column.",
    inputSchema: {
      urn: z.string(),
      column: z.string().optional(),
      source: z.enum(["MANUAL", "SYSTEM"]).optional(),
      start: z.number().int().nonnegative().default(0),
      count: z.number().int().positive().default(10),
    },
    annotations: { readOnlyHint: true },
  }, async ({ urn, start, count }) => {
    const incident = findIncident(urn);
    const field = incident.id === "INC-2048" ? "cust_email" : incident.id === "INC-2045" ? "loaded_at" : "cardholder_email";
    const queries = Array.from({ length: Math.min(count, incident.id === "INC-2048" ? 11 : 4) }, (_, index) => ({
      urn: `urn:li:query:lineagepatch-${incident.id.toLowerCase()}-${index + start}`,
      properties: {
        statement: { value: `select ${field} from ${incident.source}`, language: "SQL" },
        source: index % 2 === 0 ? "SYSTEM" : "MANUAL",
      },
      subjects: [incident.assetUrn],
    }));
    return textResult({ total: queries.length, start, count: queries.length, queries });
  });

  server.registerTool("save_document", {
    title: "Save incident memory",
    description: "Save an approved incident investigation as a DataHub context document.",
    inputSchema: {
      document_type: z.string(),
      title: z.string(),
      content: z.string(),
      urn: z.string().optional(),
      topics: z.array(z.string()).optional(),
      related_documents: z.array(z.string()).optional(),
      related_assets: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async ({ title }) => textResult({
    success: true,
    urn: `urn:li:document:lineagepatch-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    message: `Saved fixture document: ${title}`,
    author: "LineagePatch fixture",
  }));

  return server;
}
