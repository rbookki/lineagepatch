import type { AnalysisResult, PublishResult } from "../src/types.js";
import { DataHubMcpClient, type DataHubMcpConfig } from "./datahub-mcp.js";

export function buildIncidentMemory(result: AnalysisResult) {
  const patchSummary = result.patches
    .map((patch) => `- \`${patch.path}\` (+${patch.additions}/-${patch.deletions})`)
    .join("\n");

  return [
    `# ${result.incident.id}: ${result.incident.title}`,
    "",
    `**Status:** Proposed remediation, pending code review  `,
    `**Severity:** ${result.incident.severity}  `,
    `**Source:** \`${result.incident.source}\`  `,
    `**DataHub asset:** \`${result.incident.assetUrn}\`  `,
    `**Signal:** \`${result.incident.signal}\`  `,
    `**Analyzed:** ${result.completedAt}`,
    "",
    "## DataHub evidence",
    "",
    `- ${result.context.fieldsInspected} governed schema fields inspected`,
    `- ${result.blastRadius.assets} downstream assets across ${result.context.platforms} platforms`,
    `- ${result.blastRadius.critical} critical paths prioritized`,
    `- ${result.blastRadius.owners} owner identities resolved`,
    `- ${result.context.queryReferences} query references reviewed`,
    "",
    result.contractEvidence.summary,
    "",
    "## Recommendation",
    "",
    result.recommendation,
    "",
    "## Generated artifacts",
    "",
    patchSummary,
    "",
    "## Safety decision",
    "",
    "LineagePatch performed read-only investigation automatically. This document was published only after explicit human approval; generated code remains unmerged and requires repository review.",
  ].join("\n");
}

export async function publishIncidentMemory(
  result: AnalysisResult,
  config: DataHubMcpConfig,
): Promise<PublishResult> {
  const client = new DataHubMcpClient(config);
  try {
    const available = await client.connect();
    if (!available.tools.some((tool) => tool.name === "save_document")) {
      throw new Error("The configured DataHub MCP server does not expose save_document.");
    }

    const response = await client.callToolJson<PublishResult>("save_document", {
      document_type: "Analysis",
      title: `${result.incident.id}: ${result.incident.title}`,
      content: buildIncidentMemory(result),
      topics: ["lineagepatch", "incident-response", result.incident.severity, "data-contract"],
      related_assets: [result.incident.assetUrn],
    });

    if (!response.success) {
      throw new Error(response.message || "DataHub did not confirm the document write.");
    }
    return response;
  } finally {
    await client.close().catch(() => undefined);
  }
}
