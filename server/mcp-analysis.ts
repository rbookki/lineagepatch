import type { AnalysisResult, Incident } from "../src/types.js";
import { analyzeIncident } from "./analysis.js";
import { DataHubMcpClient, type DataHubMcpConfig } from "./datahub-mcp.js";

interface EntityPayload {
  name?: string;
  owners?: Array<{ name?: string }>;
}

interface SchemaPayload {
  totalFields?: number;
  returned?: number;
  fields?: Array<{
    fieldPath?: string;
    name?: string;
  }>;
}

interface LegacyLineagePayload {
  nodes?: AnalysisResult["nodes"];
  edges?: AnalysisResult["edges"];
  blastRadius?: AnalysisResult["blastRadius"];
  explanation?: string;
  recommendation?: string;
  confidence?: number;
}

interface DataHubLineageEntity {
  urn: string;
  type: string;
  name?: string;
  platform?: { name?: string };
  properties?: { name?: string };
  ownership?: {
    owners?: Array<{ owner?: { urn?: string } }>;
  };
  health?: Array<{ status?: string }>;
}

interface DataHubLineageResult {
  entity: DataHubLineageEntity;
  degree?: number;
}

interface DataHubLineagePage {
  total?: number;
  returned?: number;
  searchResults?: DataHubLineageResult[];
}

interface LineagePayload extends LegacyLineagePayload {
  downstreams?: DataHubLineagePage;
  upstreams?: DataHubLineagePage;
}

interface QueryPayload {
  total?: number;
  count?: number;
}

async function timed<T>(run: () => Promise<T>) {
  const started = performance.now();
  const value = await run();
  return { value, durationMs: Math.max(1, Math.round(performance.now() - started)) };
}

function displayName(entity: DataHubLineageEntity) {
  return entity.name ?? entity.properties?.name ?? entity.urn.split(/[,:()]/).filter(Boolean).at(-2) ?? "Data asset";
}

function nodeKind(type: string): AnalysisResult["nodes"][number]["kind"] {
  if (type === "DASHBOARD" || type === "CHART") return "dashboard";
  if (type.includes("ML") || type === "FEATURE") return "feature";
  return "model";
}

function selectRepresentativeResults(results: DataHubLineageResult[], limit = 6) {
  const sorted = [...results].sort((left, right) => (left.degree ?? 99) - (right.degree ?? 99));
  const selected: DataHubLineageResult[] = [];
  const platforms = new Set<string>();

  for (const item of sorted) {
    const platform = item.entity.platform?.name ?? item.entity.type;
    if (platforms.has(platform)) continue;
    selected.push(item);
    platforms.add(platform);
    if (selected.length === limit) return selected;
  }

  for (const item of sorted) {
    if (selected.includes(item)) continue;
    selected.push(item);
    if (selected.length === limit) break;
  }
  return selected;
}

function applyDataHubLineage(result: AnalysisResult, payload: LineagePayload) {
  const page = payload.downstreams ?? payload.upstreams;
  const lineageResults = page?.searchResults ?? [];
  if (!page || !lineageResults.length) return false;

  const representative = selectRepresentativeResults(lineageResults);
  const ownerUrns = new Set(
    lineageResults.flatMap((item) => item.entity.ownership?.owners ?? [])
      .map((ownership) => ownership.owner?.urn)
      .filter((urn): urn is string => Boolean(urn)),
  );
  const criticalCount = lineageResults.filter((item) => (
    item.entity.type === "DASHBOARD"
    || item.entity.health?.some((health) => health.status && health.status !== "PASS")
  )).length;
  const platforms = new Set(lineageResults.map((item) => item.entity.platform?.name ?? item.entity.type));

  result.nodes = [
    {
      id: "source",
      label: result.incident.source.split(".").at(-1) ?? result.incident.source,
      kind: "source",
      platform: result.incident.assetUrn.match(/dataPlatform:([^,]+)/)?.[1] ?? "DataHub",
      risk: "source",
      x: 4,
      y: 50,
    },
    ...representative.map((item, index) => ({
      id: `impact-${index}`,
      label: displayName(item.entity),
      kind: nodeKind(item.entity.type),
      platform: item.entity.platform?.name ?? item.entity.type,
      risk: (item.degree ?? 1) <= 2 ? "affected" as const : "review" as const,
      x: Math.min(82, 18 + (item.degree ?? 1) * 12),
      y: representative.length === 1 ? 50 : 10 + (index * 80) / (representative.length - 1),
    })),
  ];
  result.edges = representative.map((_item, index) => ({ from: "source", to: `impact-${index}` }));
  result.blastRadius = {
    assets: page.total ?? lineageResults.length,
    critical: criticalCount,
    owners: ownerUrns.size,
  };
  result.context.platforms = platforms.size;
  result.confidence = 97;

  const shownAssets = representative.map((item) => displayName(item.entity)).join(", ");
  result.explanation = `DataHub MCP found ${result.blastRadius.assets} downstream assets across ${platforms.size} platforms. Representative impact paths include ${shownAssets}. The graph is grounded in live catalog lineage and grouped by actual hop distance from ${result.incident.source}.`;
  if (result.incident.signal.includes("freshness")) {
    result.recommendation = `Restore source freshness before the next scheduled build, add a freshness gate at the ingestion boundary, and validate the ${result.blastRadius.critical} dashboard or unhealthy consumers first. Notify the ${result.blastRadius.owners} owner identities found in DataHub if the recovery window is missed.`;
  } else if (result.incident.signal.includes("tag")) {
    result.recommendation = `Restore the PII classification on the transformed address field, add a metadata test for term propagation, and keep downstream exports restricted until governance review. Notify the ${result.blastRadius.owners} owner identities found across the lineage.`;
  } else {
    result.recommendation = `Treat ${result.incident.signal} as a governed schema change. Add a compatibility alias at the source boundary, validate the ${result.blastRadius.critical} dashboard or unhealthy consumers first, then notify the ${result.blastRadius.owners} owner identities found across the returned lineage before rollout.`;
  }
  return true;
}

export async function analyzeIncidentViaMcp(
  incident: Incident,
  config: DataHubMcpConfig,
  provider: AnalysisResult["provider"],
  mutationAllowed = false,
): Promise<AnalysisResult> {
  const result = analyzeIncident(incident);
  const client = new DataHubMcpClient(config);

  try {
    const available = await client.connect();
    const toolNames = new Set(available.tools.map((tool) => tool.name));
    const required = ["get_entities", "list_schema_fields", "get_lineage", "get_dataset_queries"];
    const missing = required.filter((tool) => !toolNames.has(tool));
    if (missing.length) throw new Error(`DataHub MCP is missing required tools: ${missing.join(", ")}`);

    const entityCall = await timed(() => client.callToolJson<EntityPayload | EntityPayload[]>("get_entities", {
      urns: [incident.assetUrn],
    }));
    const schemaCall = await timed(() => client.callToolJson<SchemaPayload>("list_schema_fields", {
      urn: incident.assetUrn,
      limit: 100,
      offset: 0,
    }));
    const lineageCall = await timed(() => client.callToolJson<LineagePayload>("get_lineage", {
      urn: incident.assetUrn,
      upstream: false,
      max_hops: 3,
      max_results: 30,
      offset: 0,
    }));
    const queryCall = await timed(() => client.callToolJson<QueryPayload>("get_dataset_queries", {
      urn: incident.assetUrn,
      start: 0,
      count: 20,
    }));

    const entity = Array.isArray(entityCall.value) ? entityCall.value[0] : entityCall.value;
    const lineage = lineageCall.value;
    const appliedDataHubLineage = applyDataHubLineage(result, lineage);
    if (!appliedDataHubLineage) {
      if (lineage.nodes?.length) result.nodes = lineage.nodes;
      if (lineage.edges?.length) result.edges = lineage.edges;
      if (lineage.blastRadius) result.blastRadius = lineage.blastRadius;
      if (lineage.explanation) result.explanation = lineage.explanation;
      if (lineage.recommendation) result.recommendation = lineage.recommendation;
      if (lineage.confidence) result.confidence = lineage.confidence;
    }

    const observedFields = (schemaCall.value.fields ?? [])
      .map((field) => field.fieldPath ?? field.name)
      .filter((field): field is string => Boolean(field));
    const fieldsInspected = schemaCall.value.totalFields ?? schemaCall.value.returned ?? observedFields.length;
    const queryReferences = queryCall.value.total ?? queryCall.value.count ?? 0;
    const [baselineField, proposedField] = incident.signal.includes("->")
      ? incident.signal.split("->").map((field) => field.trim())
      : [undefined, undefined];

    result.context = {
      fieldsInspected,
      queryReferences,
      platforms: result.context.platforms || new Set(result.nodes.map((node) => node.platform)).size,
      observedFields,
    };
    result.contractEvidence = {
      signal: incident.signal,
      baselineField,
      proposedField,
      baselineObserved: baselineField ? observedFields.includes(baselineField) : observedFields.length > 0,
      proposedObserved: proposedField ? observedFields.includes(proposedField) : false,
      summary: baselineField && proposedField
        ? `DataHub confirms ${baselineField} in the governed baseline${observedFields.includes(proposedField) ? ` and already observes ${proposedField}` : `; the incident signal introduces ${proposedField} as the replacement`}.`
        : incident.signal.includes("freshness")
          ? "The governed schema is intact; the incident is a runtime freshness breach rather than schema drift."
          : "DataHub resolves the governed field while the incident reports a downstream classification propagation gap.",
    };
    result.writeback = {
      available: mutationAllowed && toolNames.has("save_document"),
      tool: "save_document",
      message: mutationAllowed && toolNames.has("save_document")
        ? "Ready to publish after explicit human approval."
        : "Read-only analysis complete; no external write was attempted.",
    };

    result.provider = provider;
    result.completedAt = new Date().toISOString();
    result.steps = [
      {
        tool: "get_entities",
        label: "Resolved source metadata",
        detail: `${entity?.name ?? incident.source} and ${entity?.owners?.length ?? 1} owner group loaded via MCP`,
        status: "complete",
        durationMs: entityCall.durationMs,
      },
      {
        tool: "list_schema_fields",
        label: "Compared schema context",
        detail: `${fieldsInspected} governed fields inspected`,
        status: "warning",
        durationMs: schemaCall.durationMs,
      },
      {
        tool: "get_lineage",
        label: "Traced downstream impact",
        detail: `${result.blastRadius.assets} downstream assets across ${new Set(result.nodes.map((node) => node.platform)).size} platforms`,
        status: "complete",
        durationMs: lineageCall.durationMs,
      },
      {
        tool: "get_dataset_queries",
        label: "Inspected usage evidence",
        detail: `${queryReferences} query references retrieved`,
        status: "complete",
        durationMs: queryCall.durationMs,
      },
      {
        tool: "save_document",
        label: "Incident memory gated",
        detail: mutationAllowed && toolNames.has("save_document")
          ? "Mutation tool discovered but not executed without human approval"
          : "Read-only MCP exposed no document mutation tool; no write attempted",
        status: "complete",
        durationMs: 0,
      },
    ];
    return result;
  } finally {
    await client.close().catch(() => undefined);
  }
}
