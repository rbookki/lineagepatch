import type { AnalysisResult, Incident } from "../src/types.js";
import { createDemoAnalysis } from "./demo-data.js";

export function analyzeIncident(incident: Incident): AnalysisResult {
  return createDemoAnalysis(incident);
}
