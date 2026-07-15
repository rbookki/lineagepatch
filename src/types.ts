export type Severity = "critical" | "high" | "medium";
export type IncidentStatus = "ready" | "monitoring" | "resolved";

export interface Incident {
  id: string;
  title: string;
  summary: string;
  source: string;
  severity: Severity;
  status: IncidentStatus;
  detectedAt: string;
  assetUrn: string;
  owner: string;
  signal: string;
}

export interface LineageNode {
  id: string;
  label: string;
  kind: "source" | "model" | "dashboard" | "feature";
  platform: string;
  risk: "affected" | "review" | "source";
  x: number;
  y: number;
}

export interface LineageEdge {
  from: string;
  to: string;
}

export interface EvidenceStep {
  tool: string;
  label: string;
  detail: string;
  status: "complete" | "warning";
  durationMs: number;
}

export interface PatchFile {
  path: string;
  language: string;
  additions: number;
  deletions: number;
  diff: string[];
}

export interface AnalysisResult {
  incident: Incident;
  nodes: LineageNode[];
  edges: LineageEdge[];
  steps: EvidenceStep[];
  patches: PatchFile[];
  blastRadius: {
    assets: number;
    critical: number;
    owners: number;
  };
  explanation: string;
  recommendation: string;
  confidence: number;
  provider: "mcp-fixture" | "datahub-mcp";
  completedAt: string;
  context: {
    fieldsInspected: number;
    queryReferences: number;
    platforms: number;
    observedFields: string[];
  };
  contractEvidence: {
    signal: string;
    baselineField?: string;
    proposedField?: string;
    baselineObserved: boolean;
    proposedObserved: boolean;
    summary: string;
  };
  writeback: {
    available: boolean;
    tool: "save_document";
    message: string;
  };
  fallbackReason?: string;
}

export interface BootstrapData {
  incidents: Incident[];
  connection: {
    mode: "mcp-fixture" | "datahub-mcp";
    label: string;
    endpointConfigured: boolean;
    mutationEnabled: boolean;
    transport: "http" | "stdio";
  };
}

export interface PublishResult {
  success: boolean;
  urn?: string;
  message: string;
  author?: string;
}
