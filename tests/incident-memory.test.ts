import { describe, expect, it } from "vitest";
import { analyzeIncident } from "../server/analysis.js";
import { incidents } from "../server/demo-data.js";
import { buildIncidentMemory } from "../server/incident-memory.js";

describe("incident memory", () => {
  it("creates a reviewable DataHub document grounded in analysis evidence", () => {
    const analysis = analyzeIncident(incidents[0]);
    const document = buildIncidentMemory(analysis);

    expect(document).toContain("INC-2048");
    expect(document).toContain(incidents[0].assetUrn.split(",")[1]);
    expect(document).toContain("downstream assets");
    expect(document).toContain("explicit human approval");
    expect(document).toContain("stg_customers.sql");
  });
});
