import type { AnalysisResult, Incident } from "../src/types.js";

export const incidents: Incident[] = [
  {
    id: "INC-2048",
    title: "Customer email field renamed",
    summary: "Schema drift detected in the production customer dimension.",
    source: "postgres.order_entry.customers",
    severity: "critical",
    status: "ready",
    detectedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    assetUrn: "urn:li:dataset:(urn:li:dataPlatform:postgres,b2fd91.order_entry_db.order_entry.customers,PROD)",
    owner: "Customer Experience",
    signal: "cust_email -> email_address",
  },
  {
    id: "INC-2045",
    title: "Freshness contract breached",
    summary: "Orders mart is 96 minutes behind its freshness objective.",
    source: "postgres.order_entry.orders",
    severity: "high",
    status: "monitoring",
    detectedAt: new Date(Date.now() - 126 * 60_000).toISOString(),
    assetUrn: "urn:li:dataset:(urn:li:dataPlatform:postgres,b2fd91.order_entry_db.order_entry.orders,PROD)",
    owner: "Commerce Analytics",
    signal: "freshness > 60m",
  },
  {
    id: "INC-2039",
    title: "PII tag missing downstream",
    summary: "A governed field lost its PII classification after transformation.",
    source: "postgres.order_entry.addresses",
    severity: "medium",
    status: "resolved",
    detectedAt: new Date(Date.now() - 18 * 60 * 60_000).toISOString(),
    assetUrn: "urn:li:dataset:(urn:li:dataPlatform:postgres,b2fd91.order_entry_db.order_entry.addresses,PROD)",
    owner: "Data Governance",
    signal: "tag propagation gap",
  },
];

export function createDemoAnalysis(incident: Incident): AnalysisResult {
  const result: AnalysisResult = {
    incident,
    provider: "mcp-fixture",
    completedAt: new Date().toISOString(),
    context: {
      fieldsInspected: 4,
      queryReferences: 11,
      platforms: 5,
      observedFields: ["customer_id", "cust_email", "customer_status", "updated_at"],
    },
    contractEvidence: {
      signal: incident.signal,
      baselineField: "cust_email",
      proposedField: "email_address",
      baselineObserved: true,
      proposedObserved: false,
      summary: "DataHub confirms cust_email in the governed baseline; the incident signal introduces email_address as the replacement.",
    },
    writeback: {
      available: false,
      tool: "save_document",
      message: "Enable mutation tools to publish an approved incident memory.",
    },
    blastRadius: { assets: 6, critical: 2, owners: 3 },
    confidence: 92,
    explanation:
      "The source column cust_email was replaced by email_address without a compatibility alias. DataHub lineage shows two direct models and four transitive consumers. The customer_features model is the highest-risk path because it feeds both the churn model and the executive retention dashboard.",
    recommendation:
      "Add a compatibility alias at the staging boundary, update the schema contract, and run targeted tests before promoting the rename downstream. Keep both fields for one release window, then deprecate cust_email after consumers migrate.",
    nodes: [
      { id: "source", label: "customer_360", kind: "source", platform: "Snowflake", risk: "source", x: 4, y: 42 },
      { id: "staging", label: "stg_customers", kind: "model", platform: "dbt", risk: "affected", x: 31, y: 18 },
      { id: "features", label: "customer_features", kind: "model", platform: "dbt", risk: "affected", x: 31, y: 66 },
      { id: "retention", label: "Retention overview", kind: "dashboard", platform: "Looker", risk: "review", x: 66, y: 9 },
      { id: "segments", label: "Lifecycle segments", kind: "dashboard", platform: "Tableau", risk: "review", x: 66, y: 40 },
      { id: "churn", label: "Churn propensity", kind: "feature", platform: "SageMaker", risk: "affected", x: 66, y: 73 },
    ],
    edges: [
      { from: "source", to: "staging" },
      { from: "source", to: "features" },
      { from: "staging", to: "retention" },
      { from: "staging", to: "segments" },
      { from: "features", to: "segments" },
      { from: "features", to: "churn" },
    ],
    steps: [
      { tool: "get_entities", label: "Resolved source metadata", detail: "Schema, owners, domains and assertions loaded", status: "complete", durationMs: 184 },
      { tool: "list_schema_fields", label: "Compared schema versions", detail: "Detected one renamed governed field", status: "warning", durationMs: 126 },
      { tool: "get_lineage", label: "Traced downstream impact", detail: "6 assets across 3 platforms and 3 owners", status: "complete", durationMs: 241 },
      { tool: "get_dataset_queries", label: "Inspected usage evidence", detail: "Found 11 queries referencing cust_email", status: "complete", durationMs: 209 },
      { tool: "save_document", label: "Prepared incident memory", detail: "Ready to publish after human approval", status: "complete", durationMs: 92 },
    ],
    patches: [
      {
        path: "models/staging/stg_customers.sql",
        language: "SQL",
        additions: 2,
        deletions: 1,
        diff: [
          "@@ -7,7 +7,8 @@ select",
          "   customer_id,",
          "-  cust_email,",
          "+  email_address,",
          "+  email_address as cust_email, -- compatibility window",
          "   customer_status",
          " from {{ source('order_entry', 'customers') }}",
        ],
      },
      {
        path: "models/staging/stg_customers.yml",
        language: "YAML",
        additions: 6,
        deletions: 1,
        diff: [
          "@@ -14,4 +14,9 @@ columns:",
          "-    - name: cust_email",
          "+    - name: email_address",
          "+      tests:",
          "+        - not_null",
          "+      meta:",
          "+        contains_pii: true",
          "+    - name: cust_email # deprecated alias",
        ],
      },
    ],
  };

  if (incident.id === "INC-2045") {
    result.blastRadius = { assets: 4, critical: 1, owners: 2 };
    result.confidence = 89;
    result.context = { fieldsInspected: 4, queryReferences: 4, platforms: 3, observedFields: ["order_id", "customer_id", "order_total", "loaded_at"] };
    result.contractEvidence = {
      signal: incident.signal,
      baselineObserved: true,
      proposedObserved: false,
      summary: "The governed orders schema is intact; the incident is a runtime freshness breach rather than schema drift.",
    };
    result.explanation =
      "The orders_daily freshness assertion exceeded its 60-minute objective after the upstream ingestion task retried three times. DataHub lineage shows the finance close dashboard as the only time-critical consumer; the weekly cohort model can tolerate the delay.";
    result.recommendation =
      "Increase the ingestion task timeout, add a source freshness gate before the mart build, and notify Finance Analytics if the next run misses the recovery window.";
    result.nodes = [
      { id: "source", label: "orders_raw", kind: "source", platform: "BigQuery", risk: "source", x: 4, y: 42 },
      { id: "mart", label: "orders_daily", kind: "model", platform: "dbt", risk: "affected", x: 32, y: 42 },
      { id: "finance", label: "Finance close", kind: "dashboard", platform: "Looker", risk: "affected", x: 66, y: 22 },
      { id: "cohort", label: "Weekly cohorts", kind: "model", platform: "dbt", risk: "review", x: 66, y: 63 },
    ];
    result.edges = [
      { from: "source", to: "mart" },
      { from: "mart", to: "finance" },
      { from: "mart", to: "cohort" },
    ];
    result.steps[1] = { tool: "get_entities", label: "Checked freshness assertion", detail: "Observed 96m delay against a 60m objective", status: "warning", durationMs: 118 };
    result.patches = [{
      path: "models/marts/orders_daily.yml",
      language: "YAML",
      additions: 5,
      deletions: 0,
      diff: [
        "@@ -4,3 +4,8 @@ models:",
        "   - name: orders_daily",
        "+    config:",
        "+      contract:",
        "+        enforced: true",
        "+    meta:",
        "+      freshness_slo_minutes: 60",
      ],
    }];
  }

  if (incident.id === "INC-2039") {
    result.blastRadius = { assets: 3, critical: 1, owners: 2 };
    result.confidence = 95;
    result.context = { fieldsInspected: 3, queryReferences: 4, platforms: 3, observedFields: ["payment_id", "cardholder_email", "amount"] };
    result.contractEvidence = {
      signal: incident.signal,
      baselineField: "cardholder_email",
      baselineObserved: true,
      proposedObserved: false,
      summary: "DataHub resolves the governed field, but the downstream metadata no longer carries its expected PII classification.",
    };
    result.explanation =
      "The cardholder_email field retains its upstream PII classification, but the payment_events transformation does not propagate that glossary term. One downstream export is governed by the restricted-data policy.";
    result.recommendation =
      "Restore the PII classification on the transformed field, add a metadata test for tag propagation, and retain the existing export block until governance approval.";
    result.nodes = [
      { id: "source", label: "payment_source", kind: "source", platform: "Kafka", risk: "source", x: 4, y: 42 },
      { id: "events", label: "payment_events", kind: "model", platform: "dbt", risk: "affected", x: 34, y: 42 },
      { id: "export", label: "Partner export", kind: "model", platform: "Airflow", risk: "review", x: 68, y: 42 },
    ];
    result.edges = [
      { from: "source", to: "events" },
      { from: "events", to: "export" },
    ];
    result.steps[1] = { tool: "list_schema_fields", label: "Compared governance signals", detail: "Found one missing PII glossary term", status: "warning", durationMs: 104 };
    result.patches = [{
      path: "models/staging/stg_addresses.yml",
      language: "YAML",
      additions: 4,
      deletions: 0,
      diff: [
        "@@ -10,3 +10,7 @@ columns:",
        "   - name: address_line1",
        "+    meta:",
        "+      data_classification: pii",
        "+      export_policy: restricted",
        "+      governance_review: required",
      ],
    }];
  }

  return result;
}
