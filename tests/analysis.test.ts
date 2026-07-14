import { describe, expect, it } from "vitest";
import { analyzeIncident } from "../server/analysis.js";
import { incidents } from "../server/demo-data.js";

describe("incident analysis", () => {
  it("creates a traceable remediation result", () => {
    const result = analyzeIncident(incidents[0]);

    expect(result.incident.id).toBe("INC-2048");
    expect(result.nodes).toHaveLength(result.blastRadius.assets);
    expect(result.steps.map((step) => step.tool)).toContain("get_lineage");
    expect(result.patches.some((patch) => patch.diff.some((line) => line.includes("email_address")))).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(90);
  });

  it("produces incident-specific lineage and patches", () => {
    const results = incidents.map(analyzeIncident);

    expect(new Set(results.map((result) => result.explanation)).size).toBe(3);
    expect(results[1].nodes.map((node) => node.label)).toContain("orders_daily");
    expect(results[2].patches[0].diff.join("\n")).toContain("data_classification: pii");
  });
});
