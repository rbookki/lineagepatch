import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Braces,
  Check,
  ChevronDown,
  CircleCheckBig,
  CircleGauge,
  Clock3,
  Code2,
  Database,
  Download,
  FileDiff,
  Filter,
  GitBranch,
  History,
  LayoutDashboard,
  ListChecks,
  Link2,
  LockKeyhole,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ServerCog,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type {
  AnalysisResult,
  BootstrapData,
  Incident,
  LineageNode,
  PatchFile,
  PublishResult,
} from "./types";

type ViewTab = "impact" | "patch" | "evidence";
type WorkspaceView = "incidents" | "context" | "policies" | "history" | "settings";
type SeverityFilter = "all" | Incident["severity"];

interface RunRecord {
  id: string;
  incidentId: string;
  title: string;
  completedAt: string;
  provider: AnalysisResult["provider"];
  assets: number;
  durationMs: number;
  status: "completed" | "failed";
}

interface PolicyDefinition {
  id: string;
  name: string;
  description: string;
  owner: string;
  scope: string;
  status: "triggered" | "healthy";
  incidentId: string;
  active: boolean;
  controls: string[];
}

interface UserSettings {
  autoOpenResults: boolean;
  showFixtureBadges: boolean;
  notifyOnCritical: boolean;
}

interface CatalogAsset {
  id: string;
  label: string;
  platform: "Postgres" | "dbt" | "BI" | "ML";
  kind: string;
  owner: string;
  incidentId?: string;
  x: number;
  y: number;
}

const sourceOptions = [
  { value: "postgres.order_entry.customers", label: "Customers", owner: "Customer Experience", signal: "cust_email -> email_address" },
  { value: "postgres.order_entry.orders", label: "Orders", owner: "Commerce Analytics", signal: "freshness > 60m" },
  { value: "postgres.order_entry.addresses", label: "Addresses", owner: "Data Governance", signal: "tag propagation gap" },
] as const;

const catalogAssets: CatalogAsset[] = [
  { id: "customers", label: "customers", platform: "Postgres", kind: "Dataset", owner: "Customer Experience", incidentId: "INC-2048", x: 5, y: 20 },
  { id: "orders", label: "orders", platform: "Postgres", kind: "Dataset", owner: "Commerce Analytics", incidentId: "INC-2045", x: 5, y: 50 },
  { id: "addresses", label: "addresses", platform: "Postgres", kind: "Dataset", owner: "Data Governance", incidentId: "INC-2039", x: 5, y: 80 },
  { id: "stg-customers", label: "stg_customers", platform: "dbt", kind: "Model", owner: "Customer Experience", incidentId: "INC-2048", x: 36, y: 20 },
  { id: "orders-daily", label: "orders_daily", platform: "dbt", kind: "Model", owner: "Commerce Analytics", incidentId: "INC-2045", x: 36, y: 50 },
  { id: "payment-events", label: "payment_events", platform: "dbt", kind: "Model", owner: "Data Governance", incidentId: "INC-2039", x: 36, y: 80 },
  { id: "retention", label: "Retention overview", platform: "BI", kind: "Dashboard", owner: "Customer Experience", incidentId: "INC-2048", x: 70, y: 14 },
  { id: "finance", label: "Finance close", platform: "BI", kind: "Dashboard", owner: "Commerce Analytics", incidentId: "INC-2045", x: 70, y: 50 },
  { id: "churn", label: "Churn propensity", platform: "ML", kind: "Feature set", owner: "ML Platform", incidentId: "INC-2048", x: 70, y: 82 },
];

const catalogEdges = [
  ["customers", "stg-customers"], ["stg-customers", "retention"], ["stg-customers", "churn"],
  ["orders", "orders-daily"], ["orders-daily", "finance"],
  ["addresses", "payment-events"], ["payment-events", "churn"],
] as const;

const initialPolicies: PolicyDefinition[] = [
  {
    id: "POL-17",
    name: "Schema compatibility window",
    description: "Renamed governed fields must retain a compatibility alias for one release window.",
    owner: "Data Platform",
    scope: "12 production datasets",
    status: "triggered",
    incidentId: "INC-2048",
    active: true,
    controls: ["Detect renamed fields", "Require contract update", "Block silent removal"],
  },
  {
    id: "POL-09",
    name: "Critical mart freshness",
    description: "Revenue and close reporting models must remain within a 60-minute freshness objective.",
    owner: "Commerce Analytics",
    scope: "8 finance assets",
    status: "triggered",
    incidentId: "INC-2045",
    active: true,
    controls: ["Evaluate freshness assertion", "Notify owner group", "Prioritize critical consumers"],
  },
  {
    id: "POL-04",
    name: "PII term propagation",
    description: "Restricted glossary terms must propagate through transformations and exports.",
    owner: "Data Governance",
    scope: "24 governed fields",
    status: "healthy",
    incidentId: "INC-2039",
    active: true,
    controls: ["Compare upstream terms", "Restrict exports", "Require governance review"],
  },
];

const initialRuns: RunRecord[] = [
  { id: "RUN-319", incidentId: "INC-2048", title: "Customer email field renamed", completedAt: new Date(Date.now() - 16 * 60_000).toISOString(), provider: "datahub-mcp", assets: 41, durationMs: 1328, status: "completed" },
  { id: "RUN-318", incidentId: "INC-2045", title: "Freshness contract breached", completedAt: new Date(Date.now() - 2.4 * 60 * 60_000).toISOString(), provider: "mcp-fixture", assets: 4, durationMs: 914, status: "completed" },
  { id: "RUN-317", incidentId: "INC-2039", title: "PII tag missing downstream", completedAt: new Date(Date.now() - 18.2 * 60 * 60_000).toISOString(), provider: "mcp-fixture", assets: 3, durationMs: 886, status: "completed" },
];

const kindIcons = {
  source: Database,
  model: Braces,
  dashboard: LayoutDashboard,
  feature: CircleGauge,
};

const severityRank = { critical: 0, high: 1, medium: 2 };

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NodeCard({ node }: { node: LineageNode }) {
  const Icon = kindIcons[node.kind];
  return (
    <div
      className={`graph-node graph-node--${node.risk}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      title={`${node.platform}: ${node.label}`}
    >
      <span className="graph-node__icon"><Icon size={15} strokeWidth={1.9} /></span>
      <span className="graph-node__copy">
        <strong>{node.label}</strong>
        <small>{node.platform}</small>
      </span>
    </div>
  );
}

function LineageGraph({ result }: { result: AnalysisResult }) {
  const byId = useMemo(() => new Map(result.nodes.map((node) => [node.id, node])), [result]);
  return (
    <div className="graph" aria-label="Downstream lineage impact graph">
      <svg className="graph__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {result.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={`M ${from.x + 12} ${from.y + 7} C ${from.x + 20} ${from.y + 7}, ${to.x - 8} ${to.y + 7}, ${to.x} ${to.y + 7}`}
            />
          );
        })}
      </svg>
      {result.nodes.map((node) => <NodeCard key={node.id} node={node} />)}
      <div className="graph__legend">
        <span><i className="legend-dot legend-dot--source" /> Source</span>
        <span><i className="legend-dot legend-dot--affected" /> Direct impact</span>
        <span><i className="legend-dot legend-dot--review" /> Review</span>
      </div>
    </div>
  );
}

function downloadPatchBundle(incidentId: string, patches: PatchFile[]) {
  const content = patches.map((patch) => [
    `diff --git a/${patch.path} b/${patch.path}`,
    `--- a/${patch.path}`,
    `+++ b/${patch.path}`,
    ...patch.diff,
  ].join("\n")).join("\n\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/x-diff" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${incidentId.toLowerCase()}-lineagepatch.diff`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PatchViewer({ incidentId, patches }: { incidentId: string; patches: PatchFile[] }) {
  const [activePath, setActivePath] = useState(patches[0]?.path ?? "");
  const patch = patches.find((item) => item.path === activePath) ?? patches[0];
  if (!patch) return null;
  return (
    <div className="patch-viewer">
      <div className="patch-viewer__files" role="tablist" aria-label="Proposed patch files">
        {patches.map((item) => (
          <button
            key={item.path}
            className={item.path === patch.path ? "is-active" : ""}
            onClick={() => setActivePath(item.path)}
            role="tab"
            aria-selected={item.path === patch.path}
          >
            <FileDiff size={15} />
            <span>{item.path.split("/").at(-1)}</span>
            <small>+{item.additions} -{item.deletions}</small>
          </button>
        ))}
      </div>
      <div className="patch-viewer__code">
        <div className="code-header">
          <span>{patch.path}</span>
          <div><small>{patch.language}</small><button onClick={() => downloadPatchBundle(incidentId, patches)} title="Download complete patch"><Download size={14} /></button></div>
        </div>
        <pre>{patch.diff.map((line, index) => {
          const tone = line.startsWith("+") ? "add" : line.startsWith("-") ? "remove" : line.startsWith("@@") ? "meta" : "plain";
          return <code key={`${line}-${index}`} className={`diff-line diff-line--${tone}`}>{line}</code>;
        })}</pre>
      </div>
    </div>
  );
}

function WritebackPanel({ analysis, published, onPublished }: {
  analysis: AnalysisResult;
  published: PublishResult | null;
  onPublished: (result: PublishResult) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  async function publish() {
    setPublishing(true);
    setError("");
    try {
      const response = await fetch(`/api/incidents/${analysis.incident.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "DataHub write-back failed.");
      onPublished(payload as PublishResult);
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DataHub write-back failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className={`writeback-panel ${published ? "is-published" : ""}`}>
      <div className="writeback-panel__icon"><Save size={18} /></div>
      <div className="writeback-panel__copy">
        <span className="eyebrow">DATAHUB MEMORY</span>
        <strong>{published ? "Investigation published" : "Make this incident reusable"}</strong>
        <p>{published?.message ?? analysis.writeback.message}</p>
        {published?.urn && <code>{published.urn}</code>}
        {error && <small>{error}</small>}
      </div>
      <div className="writeback-panel__actions">
        {!published && !confirming && <button className="button button--secondary" disabled={!analysis.writeback.available} onClick={() => setConfirming(true)}><Save size={15} /> Publish to DataHub</button>}
        {!published && confirming && <div className="approval-actions"><p>Publish the evidence summary and related asset link? Proposed code will remain unmerged.</p><div><button className="button button--quiet" onClick={() => setConfirming(false)} disabled={publishing}>Cancel</button><button className="button button--primary" onClick={publish} disabled={publishing}>{publishing ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{publishing ? "Publishing" : "Approve write"}</button></div></div>}
        {published && <span className="published-badge"><Check size={14} /> Written through MCP</span>}
      </div>
    </section>
  );
}

function EmptyAnalysis({ onRun, running }: { onRun: () => void; running: boolean }) {
  return (
    <div className="empty-analysis">
      <span className="empty-analysis__mark"><GitBranch size={25} /></span>
      <h2>Trace this incident through DataHub</h2>
      <p>Load schemas, lineage, ownership and usage evidence before generating a reviewable patch.</p>
      <button className="button button--primary" onClick={onRun} disabled={running}>
        {running ? <LoaderCircle className="spin" size={17} /> : <Play size={17} fill="currentColor" />}
        {running ? "Tracing impact..." : "Run impact analysis"}
      </button>
    </div>
  );
}

function ConnectionPanel({ data, onClose }: { data: BootstrapData; onClose: () => void }) {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  async function testConnection() {
    setTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/datahub/test", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setMessage(`Connected. ${payload.tools.length} DataHub tools available.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="DataHub connection" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer__header">
          <div><span className="eyebrow">CONNECTION</span><h2>DataHub MCP</h2></div>
          <button className="icon-button" onClick={onClose} title="Close connection panel"><X size={18} /></button>
        </div>
        <div className="connection-visual">
          <span className="connection-visual__endpoint"><Link2 size={20} /></span>
          <span className="connection-visual__line" />
          <span className="connection-visual__endpoint connection-visual__endpoint--datahub"><Database size={20} /></span>
        </div>
        <div className="connection-state">
          <span className="status-dot status-dot--live" />
          <div><strong>{data.connection.label}</strong><p>{data.connection.mode === "mcp-fixture" ? "Real MCP transport with deterministic DataHub-shaped metadata." : "Service-account connection is configured."}</p></div>
        </div>
        <div className="config-list">
          <div><span>Transport</span><strong>{data.connection.transport === "stdio" ? "Local stdio" : "Streamable HTTP"}</strong></div>
          <div><span>Endpoint</span><strong>{data.connection.endpointConfigured ? "Configured" : "Default"}</strong></div>
          <div><span>Mutation tools</span><strong>{data.connection.mutationEnabled ? "Enabled with approval" : "Disabled"}</strong></div>
          <div><span>Credentials</span><strong>Server-side only</strong></div>
        </div>
        <div className="drawer__note">
          <ShieldCheck size={17} />
          <p>Tokens are read from environment variables by the API and are never sent to the browser.</p>
        </div>
        {message && <p className="connection-message">{message}</p>}
        <button className="button button--secondary button--wide" onClick={testConnection} disabled={testing}>
          {testing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
          {testing ? "Testing..." : "Test configured endpoint"}
        </button>
      </aside>
    </div>
  );
}

function ReportIncidentModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (incident: Incident) => void;
}) {
  const [source, setSource] = useState<(typeof sourceOptions)[number]["value"]>(sourceOptions[0].value);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState<Incident["severity"]>("high");
  const selectedSource = sourceOptions.find((option) => option.value === source) ?? sourceOptions[0];
  const [owner, setOwner] = useState<string>(selectedSource.owner);
  const [signal, setSignal] = useState<string>(selectedSource.signal);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function changeSource(value: (typeof sourceOptions)[number]["value"]) {
    const next = sourceOptions.find((option) => option.value === value) ?? sourceOptions[0];
    setSource(value);
    setOwner(next.owner);
    setSignal(next.signal);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, source, severity, owner, signal }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Incident could not be created.");
      onCreated(payload as Incident);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Incident could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div><span className="eyebrow">NEW SIGNAL</span><h2 id="report-title">Report data incident</h2><p>Create a traceable incident and route it into impact analysis.</p></div>
          <button type="button" className="icon-button" onClick={onClose} title="Close report form"><X size={18} /></button>
        </div>
        <div className="form-grid">
          <label className="field field--wide"><span>Incident title</span><input required minLength={4} maxLength={90} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Describe the failed contract" autoFocus /></label>
          <label className="field"><span>Source dataset</span><select value={source} onChange={(event) => changeSource(event.target.value as typeof source)}>{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="field"><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as Incident["severity"])}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option></select></label>
          <label className="field"><span>Owner</span><input required value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
          <label className="field"><span>Observed signal</span><input required value={signal} onChange={(event) => setSignal(event.target.value)} /></label>
          <label className="field field--wide"><span>Summary</span><textarea required minLength={8} maxLength={240} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What changed, and which workflow is at risk?" /></label>
        </div>
        {formError && <p className="form-error"><AlertTriangle size={14} /> {formError}</p>}
        <div className="modal__actions"><button type="button" className="button button--quiet" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{submitting ? "Creating" : "Create incident"}</button></div>
      </form>
    </div>
  );
}

function ContextGraphPage({ incidents, onOpenIncident }: { incidents: Incident[]; onOpenIncident: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<"all" | CatalogAsset["platform"]>("all");
  const byId = useMemo(() => new Map(catalogAssets.map((asset) => [asset.id, asset])), []);
  const visible = (asset: CatalogAsset) => {
    const textMatch = `${asset.label} ${asset.owner} ${asset.kind}`.toLowerCase().includes(query.toLowerCase());
    return textMatch && (platform === "all" || asset.platform === platform);
  };

  return (
    <div className="workspace-page">
      <div className="page-toolbar">
        <label className="page-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an asset or owner" /></label>
        <div className="segmented" aria-label="Filter by platform">{(["all", "Postgres", "dbt", "BI", "ML"] as const).map((item) => <button key={item} className={platform === item ? "is-active" : ""} onClick={() => setPlatform(item)}>{item === "all" ? "All platforms" : item}</button>)}</div>
      </div>
      <div className="page-metrics"><div><strong>{catalogAssets.length}</strong><span>catalog assets</span></div><div><strong>{catalogEdges.length}</strong><span>lineage links</span></div><div><strong>{incidents.length}</strong><span>open signals</span></div><div><strong>3</strong><span>owner groups</span></div></div>
      <div className="catalog-layout">
        <section className="catalog-graph" aria-label="Workspace context graph">
          <div className="catalog-lanes"><span>Sources</span><span>Transformations</span><span>Consumers</span></div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{catalogEdges.map(([fromId, toId]) => {
            const from = byId.get(fromId); const to = byId.get(toId);
            if (!from || !to) return null;
            return <path key={`${fromId}-${toId}`} className={visible(from) && visible(to) ? "" : "is-muted"} d={`M ${from.x + 12} ${from.y + 4} C ${from.x + 22} ${from.y + 4}, ${to.x - 8} ${to.y + 4}, ${to.x} ${to.y + 4}`} />;
          })}</svg>
          {catalogAssets.map((asset) => <button key={asset.id} className={`catalog-node ${visible(asset) ? "" : "is-muted"} ${asset.incidentId ? "has-incident" : ""}`} style={{ left: `${asset.x}%`, top: `${asset.y}%` }} onClick={() => asset.incidentId && onOpenIncident(asset.incidentId)} disabled={!asset.incidentId} title={asset.incidentId ? `Open ${asset.incidentId}` : asset.label}><span>{asset.platform === "Postgres" ? <Database size={15} /> : asset.platform === "dbt" ? <Braces size={15} /> : asset.platform === "BI" ? <LayoutDashboard size={15} /> : <CircleGauge size={15} />}</span><strong>{asset.label}</strong><small>{asset.platform} · {asset.kind}</small></button>)}
        </section>
        <aside className="context-signals"><div className="section-heading"><div><h3>Open signals</h3><p>Connected to affected assets</p></div></div>{incidents.map((incident) => <button key={incident.id} onClick={() => onOpenIncident(incident.id)}><span className={`severity severity--${incident.severity}`}>{incident.severity}</span><strong>{incident.title}</strong><small>{incident.owner}</small><ArrowRight size={14} /></button>)}</aside>
      </div>
    </div>
  );
}

function PoliciesPage({ policies, onChange, onOpenIncident }: { policies: PolicyDefinition[]; onChange: (policies: PolicyDefinition[]) => void; onOpenIncident: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState(policies[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | PolicyDefinition["status"]>("all");
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState("Never");
  const visible = policies.filter((policy) => filter === "all" || policy.status === filter);
  const selected = policies.find((policy) => policy.id === selectedId) ?? visible[0] ?? policies[0];

  function updateSelected(update: Partial<PolicyDefinition>) {
    onChange(policies.map((policy) => policy.id === selected?.id ? { ...policy, ...update } : policy));
  }

  async function runChecks() {
    setChecking(true);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    setLastChecked(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setChecking(false);
  }

  return (
    <div className="workspace-page">
      <div className="page-toolbar"><div className="segmented">{(["all", "triggered", "healthy"] as const).map((item) => <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All policies" : item}</button>)}</div><button className="button button--primary" onClick={runChecks} disabled={checking}>{checking ? <LoaderCircle className="spin" size={16} /> : <ListChecks size={16} />}{checking ? "Checking" : "Run policy checks"}</button></div>
      <div className="page-metrics"><div><strong>{policies.length}</strong><span>policy controls</span></div><div><strong>{policies.filter((policy) => policy.active).length}</strong><span>active</span></div><div><strong>{policies.filter((policy) => policy.status === "triggered").length}</strong><span>triggered</span></div><div><strong>{lastChecked}</strong><span>last checked</span></div></div>
      <div className="policy-layout">
        <section className="policy-list">{visible.map((policy) => <button key={policy.id} className={policy.id === selected?.id ? "is-active" : ""} onClick={() => setSelectedId(policy.id)}><span className={`policy-status policy-status--${policy.status}`}>{policy.status === "healthy" ? <CircleCheckBig size={15} /> : <ShieldAlert size={15} />}</span><div><small>{policy.id} · {policy.scope}</small><strong>{policy.name}</strong><span>{policy.owner}</span></div><ChevronDown size={15} /></button>)}</section>
        {selected && <section className="policy-detail"><div className="policy-detail__heading"><div><span className="eyebrow">{selected.id}</span><h2>{selected.name}</h2><p>{selected.description}</p></div><label className="switch" title="Enable policy"><input type="checkbox" checked={selected.active} onChange={(event) => updateSelected({ active: event.target.checked })} /><span /></label></div><dl className="detail-grid"><div><dt>Owner</dt><dd>{selected.owner}</dd></div><div><dt>Scope</dt><dd>{selected.scope}</dd></div><div><dt>State</dt><dd className={`text-${selected.status}`}>{selected.status}</dd></div></dl><div className="control-list"><span className="eyebrow">ENFORCED CONTROLS</span>{selected.controls.map((control) => <div key={control}><Check size={14} /><span>{control}</span></div>)}</div><div className="policy-detail__footer"><div><strong>{selected.status === "triggered" ? "Related incident requires review" : "No current breach"}</strong><p>{selected.status === "triggered" ? "Open the linked incident to inspect evidence and remediation." : "The latest metadata state satisfies this policy."}</p></div><button className="button button--secondary" onClick={() => onOpenIncident(selected.incidentId)}>Open incident <ArrowRight size={15} /></button></div></section>}
      </div>
    </div>
  );
}

function RunHistoryPage({ runs, onOpenRun }: { runs: RunRecord[]; onOpenRun: (incidentId: string) => void }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<"all" | AnalysisResult["provider"]>("all");
  const visible = runs.filter((run) => `${run.id} ${run.incidentId} ${run.title}`.toLowerCase().includes(query.toLowerCase()) && (provider === "all" || run.provider === provider));
  return (
    <div className="workspace-page">
      <div className="page-toolbar"><label className="page-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs" /></label><div className="segmented">{(["all", "datahub-mcp", "mcp-fixture"] as const).map((item) => <button key={item} className={provider === item ? "is-active" : ""} onClick={() => setProvider(item)}>{item === "all" ? "All providers" : item === "datahub-mcp" ? "Live DataHub" : "MCP fixture"}</button>)}</div></div>
      <div className="page-metrics"><div><strong>{runs.length}</strong><span>total runs</span></div><div><strong>{runs.filter((run) => run.status === "completed").length}</strong><span>completed</span></div><div><strong>{Math.round(runs.reduce((total, run) => total + run.durationMs, 0) / Math.max(1, runs.length))} ms</strong><span>average duration</span></div><div><strong>{runs.reduce((total, run) => total + run.assets, 0)}</strong><span>assets traced</span></div></div>
      <section className="history-table"><div className="history-table__head"><span>Run</span><span>Incident</span><span>Provider</span><span>Result</span><span>Completed</span><span /></div>{visible.map((run) => <div className="history-row" key={run.id}><span><CircleCheckBig size={16} /><strong>{run.id}</strong></span><span><strong>{run.title}</strong><small>{run.incidentId}</small></span><span className="provider-cell"><Database size={14} />{run.provider === "datahub-mcp" ? "Live DataHub" : "MCP fixture"}</span><span><strong>{run.assets} assets</strong><small>{run.durationMs} ms</small></span><span>{timeAgo(run.completedAt)}</span><button className="icon-button" onClick={() => onOpenRun(run.incidentId)} title="Open run result"><ArrowRight size={16} /></button></div>)}{visible.length === 0 && <div className="empty-row">No runs match the current filters.</div>}</section>
    </div>
  );
}

function SettingsPage({ data, settings, onSettingsChange, onOpenConnection, onTest, testing, lastSynced }: {
  data: BootstrapData;
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  onOpenConnection: () => void;
  onTest: () => void;
  testing: boolean;
  lastSynced: string;
}) {
  const setSetting = (key: keyof UserSettings, value: boolean) => onSettingsChange({ ...settings, [key]: value });
  return (
    <div className="workspace-page settings-layout">
      <section className="settings-section"><div className="settings-section__heading"><span><ServerCog size={18} /></span><div><h2>DataHub connection</h2><p>Metadata is requested by the server over MCP.</p></div></div><div className="connection-summary"><span className="status-dot status-dot--live" /><div><strong>{data.connection.label}</strong><small>{data.connection.mode === "datahub-mcp" ? "Live service connection" : "Deterministic MCP fixture"}</small></div><span>{data.connection.transport === "stdio" ? "Local stdio" : "Streamable HTTP"}</span></div><div className="settings-actions"><button className="button button--secondary" onClick={onOpenConnection}><SlidersHorizontal size={15} /> Connection details</button><button className="button button--primary" onClick={onTest} disabled={testing}>{testing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{testing ? "Testing" : "Test connection"}</button></div><p className="settings-meta">Last metadata sync: {lastSynced}</p></section>
      <section className="settings-section"><div className="settings-section__heading"><span><BellRing size={18} /></span><div><h2>Workspace preferences</h2><p>These preferences are saved in this browser.</p></div></div><label className="setting-row"><span><strong>Open results after analysis</strong><small>Switch to the impact graph when a run completes.</small></span><span className="switch"><input type="checkbox" checked={settings.autoOpenResults} onChange={(event) => setSetting("autoOpenResults", event.target.checked)} /><i /></span></label><label className="setting-row"><span><strong>Show fixture labels</strong><small>Identify deterministic evidence when no live endpoint is configured.</small></span><span className="switch"><input type="checkbox" checked={settings.showFixtureBadges} onChange={(event) => setSetting("showFixtureBadges", event.target.checked)} /><i /></span></label><label className="setting-row"><span><strong>Critical incident alerts</strong><small>Mark critical reports for owner notification.</small></span><span className="switch"><input type="checkbox" checked={settings.notifyOnCritical} onChange={(event) => setSetting("notifyOnCritical", event.target.checked)} /><i /></span></label></section>
      <section className="settings-section"><div className="settings-section__heading"><span><LockKeyhole size={18} /></span><div><h2>Safety controls</h2><p>Write operations remain gated even when metadata reads are live.</p></div></div><div className="safety-row"><ShieldCheck size={17} /><div><strong>Explicit approval required</strong><p>Proposed code and DataHub memory are never published automatically.</p></div><span>Locked</span></div><div className="safety-row"><LockKeyhole size={17} /><div><strong>Server-side credentials</strong><p>Endpoint secrets are not exposed to the browser bundle.</p></div><span>Enforced</span></div></section>
    </div>
  );
}

const viewHeadings: Record<WorkspaceView, { eyebrow: string; title: string }> = {
  incidents: { eyebrow: "OPERATIONS", title: "Incident review" },
  context: { eyebrow: "CATALOG", title: "Context graph" },
  policies: { eyebrow: "GOVERNANCE", title: "Policy controls" },
  history: { eyebrow: "AUDIT", title: "Run history" },
  settings: { eyebrow: "WORKSPACE", title: "Settings" },
};

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [view, setView] = useState<WorkspaceView>("incidents");
  const [selectedId, setSelectedId] = useState("INC-2048");
  const [analysisByIncident, setAnalysisByIncident] = useState<Record<string, AnalysisResult>>({});
  const [publishedByIncident, setPublishedByIncident] = useState<Record<string, PublishResult>>({});
  const [runningIncidentId, setRunningIncidentId] = useState("");
  const [tab, setTab] = useState<ViewTab>("impact");
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState("Not synced this session");
  const [runs, setRuns] = useState<RunRecord[]>(initialRuns);
  const [policies, setPolicies] = useState<PolicyDefinition[]>(initialPolicies);
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem("lineagepatch-settings");
      if (saved) return JSON.parse(saved) as UserSettings;
    } catch { /* Browser storage is optional. */ }
    return { autoOpenResults: true, showFixtureBadges: true, notifyOnCritical: true };
  });

  useEffect(() => {
    fetch("/api/bootstrap")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the workspace.");
        return response.json();
      })
      .then((data: BootstrapData) => setBootstrap(data))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    try { localStorage.setItem("lineagepatch-settings", JSON.stringify(settings)); } catch { /* Browser storage is optional. */ }
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const incidents = useMemo(() => {
    if (!bootstrap) return [];
    return [...bootstrap.incidents]
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .filter((incident) => severityFilter === "all" || incident.severity === severityFilter)
      .filter((incident) => `${incident.id} ${incident.title} ${incident.source} ${incident.owner}`.toLowerCase().includes(query.toLowerCase()));
  }, [bootstrap, query, severityFilter]);

  const selected = bootstrap?.incidents.find((incident) => incident.id === selectedId) ?? incidents[0];
  const analysis = selected ? analysisByIncident[selected.id] ?? null : null;
  const published = selected ? publishedByIncident[selected.id] ?? null : null;
  const running = runningIncidentId === selected?.id;
  const heading = viewHeadings[view];

  function openIncident(id: string) {
    setSelectedId(id);
    setView("incidents");
    setTab("impact");
    setFilterOpen(false);
  }

  async function runAnalysis(incidentId = selected?.id) {
    if (!bootstrap || !incidentId) return;
    const incident = bootstrap.incidents.find((item) => item.id === incidentId);
    if (!incident) return;
    const startedAt = performance.now();
    setRunningIncidentId(incidentId);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Impact analysis could not be completed.");
      const result = payload as AnalysisResult;
      setAnalysisByIncident((current) => ({ ...current, [incidentId]: result }));
      setPublishedByIncident((current) => { const next = { ...current }; delete next[incidentId]; return next; });
      setRuns((current) => [{ id: `RUN-${320 + current.length}`, incidentId, title: incident.title, completedAt: result.completedAt, provider: result.provider, assets: result.blastRadius.assets, durationMs: Math.max(1, Math.round(performance.now() - startedAt)), status: "completed" }, ...current]);
      if (settings.autoOpenResults) { setSelectedId(incidentId); setView("incidents"); setTab("impact"); }
      setToast(`Impact analysis completed for ${incidentId}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unknown analysis error");
    } finally {
      setRunningIncidentId("");
    }
  }

  async function syncMetadata() {
    setSyncing(true);
    setError("");
    try {
      const response = await fetch("/api/datahub/test", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Metadata sync failed.");
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastSynced(timestamp);
      setToast(`Metadata connection verified. ${payload.tools.length} tools available.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Metadata sync failed.";
      setError(message);
      setToast(`Error: ${message}`);
    } finally {
      setSyncing(false);
    }
  }

  function addIncident(incident: Incident) {
    setBootstrap((current) => current ? { ...current, incidents: [incident, ...current.incidents] } : current);
    setSelectedId(incident.id);
    setView("incidents");
    setTab("impact");
    setReportOpen(false);
    setQuery("");
    setSeverityFilter("all");
    setToast(`${incident.id} created and ready for analysis.`);
  }

  if (!bootstrap && !error) return <div className="app-loader"><LoaderCircle className="spin" size={24} /><span>Opening workspace</span></div>;
  if (!bootstrap) return <div className="app-loader app-loader--error"><AlertTriangle size={24} /><span>{error}</span></div>;

  const navItems: Array<{ id: WorkspaceView; label: string; icon: typeof Activity }> = [
    { id: "incidents", label: "Incidents", icon: Activity },
    { id: "context", label: "Context graph", icon: Workflow },
    { id: "policies", label: "Policies", icon: ShieldCheck },
    { id: "history", label: "Run history", icon: History },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand__mark"><GitBranch size={19} /></span><span>LineagePatch</span></div>
        <nav aria-label="Primary navigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${view === item.id ? "is-active" : ""}`} onClick={() => setView(item.id)} aria-label={item.label} title={item.label}><Icon size={17} /><span>{item.label}</span>{item.id === "incidents" && <small>{bootstrap.incidents.length}</small>}</button>; })}</nav>
        <div className="sidebar__bottom">
          <button className="connection-chip" onClick={() => setDrawerOpen(true)}><span className={`status-dot ${analysis?.fallbackReason ? "status-dot--fallback" : "status-dot--live"}`} /><span><strong>DataHub</strong><small>{analysis?.fallbackReason ? "Fixture fallback active" : bootstrap.connection.label}</small></span><ChevronDown size={14} /></button>
          <div className="profile"><span>RM</span><div><strong>R. Metadata</strong><small>Data platform</small></div></div>
        </div>
      </aside>

      <main>
        <header className="topbar"><div><span className="eyebrow">{heading.eyebrow}</span><h1>{heading.title}</h1></div><div className="topbar__actions"><button className="button button--quiet" onClick={syncMetadata} disabled={syncing} title="Verify the configured metadata endpoint">{syncing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{syncing ? "Syncing" : "Sync metadata"}</button><button className="button button--primary topbar__report" onClick={() => setReportOpen(true)} aria-label="Report incident" title="Report incident"><Plus size={16} /><span>Report incident</span></button></div></header>

        {view === "incidents" && <div className="workspace">
          <section className="incident-rail" aria-label="Incident list">
            <div className="rail-header"><div><h2>Open incidents</h2><span>{incidents.length} visible</span></div><div className="filter-control"><button className={`icon-button ${severityFilter !== "all" ? "is-filtered" : ""}`} title="Filter incidents" onClick={() => setFilterOpen((open) => !open)}><Filter size={17} /></button>{filterOpen && <div className="filter-menu"><span>Severity</span>{(["all", "critical", "high", "medium"] as const).map((item) => <button key={item} className={severityFilter === item ? "is-active" : ""} onClick={() => { setSeverityFilter(item); setFilterOpen(false); }}>{item}</button>)}</div>}</div></div>
            <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search incidents" /></label>
            <div className="incident-list">{incidents.map((incident) => <button key={incident.id} className={`incident-row ${incident.id === selected?.id ? "is-active" : ""}`} onClick={() => openIncident(incident.id)}><div className="incident-row__top"><span className={`severity severity--${incident.severity}`}>{incident.severity}</span><small>{timeAgo(incident.detectedAt)}</small></div><strong>{incident.title}</strong><span>{incident.source}</span><div className="incident-row__footer"><small>{incident.id}</small><small>{incident.owner}</small></div></button>)}{incidents.length === 0 && <div className="rail-empty">No incidents match these filters.</div>}</div>
          </section>

          <section className="review-pane">{selected && <>
            <div className="review-heading"><div><div className="review-heading__meta"><span className={`severity severity--${selected.severity}`}>{selected.severity}</span><span>{selected.id}</span><span><Clock3 size={13} /> {timeAgo(selected.detectedAt)}</span></div><h2>{selected.title}</h2><p>{selected.summary}</p></div><button className="button button--primary" onClick={() => runAnalysis(selected.id)} disabled={Boolean(runningIncidentId)}>{running ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{running ? "Analyzing" : analysis ? "Run again" : "Analyze impact"}</button></div>
            <div className="signal-strip"><div><span>Signal</span><strong><Code2 size={15} /> {selected.signal}</strong></div><div><span>Source</span><strong><Database size={15} /> {selected.source}</strong></div><div><span>Owner</span><strong><Users size={15} /> {selected.owner}</strong></div></div>
            <div className="tabs" role="tablist"><button className={tab === "impact" ? "is-active" : ""} onClick={() => setTab("impact")} role="tab">Impact graph</button><button className={tab === "patch" ? "is-active" : ""} onClick={() => setTab("patch")} role="tab">Proposed patch {analysis && <span>{analysis.patches.length}</span>}</button><button className={tab === "evidence" ? "is-active" : ""} onClick={() => setTab("evidence")} role="tab">Evidence trail {analysis && <span>{analysis.steps.length}</span>}</button></div>
            <div className="content-area">
              {error && <div className="fallback-banner"><AlertTriangle size={15} /><span>{error}</span><button onClick={() => setError("")} title="Dismiss error"><X size={14} /></button></div>}
              {analysis?.fallbackReason && <div className="fallback-banner"><AlertTriangle size={15} /><span>{analysis.fallbackReason}</span></div>}
              {!analysis && <EmptyAnalysis onRun={() => runAnalysis(selected.id)} running={running} />}
              {analysis && tab === "impact" && <div className="impact-layout"><div className="impact-main"><div className="section-heading"><div><h3>Downstream blast radius</h3><p>Table and column lineage, 3 hops</p></div><span className="confidence"><Check size={14} /> {analysis.confidence}% confidence</span></div><LineageGraph result={analysis} /><div className="analysis-note"><span><Sparkles size={17} /></span><div><strong>Why this matters</strong><p>{analysis.explanation}</p></div></div><div className="contract-evidence"><div><span className="eyebrow">CONTRACT EVIDENCE</span><strong>{analysis.contractEvidence.signal}</strong><p>{analysis.contractEvidence.summary}</p></div><dl><div><dt>Fields</dt><dd>{analysis.context.fieldsInspected}</dd></div><div><dt>Queries</dt><dd>{analysis.context.queryReferences}</dd></div><div><dt>Platforms</dt><dd>{analysis.context.platforms}</dd></div></dl></div></div><aside className="impact-summary"><h3>Impact summary</h3><div className="metric-grid"><div><strong>{analysis.blastRadius.assets}</strong><span>affected assets</span></div><div><strong>{analysis.blastRadius.critical}</strong><span>critical paths</span></div><div><strong>{analysis.blastRadius.owners}</strong><span>owners to notify</span></div></div><div className="recommendation"><span className="eyebrow">RECOMMENDATION</span><p>{analysis.recommendation}</p></div><button className="button button--secondary button--wide" onClick={() => setTab("patch")}><FileDiff size={16} /> Review proposed patch <ArrowRight size={15} /></button></aside></div>}
              {analysis && tab === "patch" && <div className="tab-panel"><div className="section-heading"><div><h3>Reviewable remediation</h3><p>Derived from schema, lineage and query evidence</p></div><span className="review-badge">Human approval required</span></div><PatchViewer incidentId={analysis.incident.id} patches={analysis.patches} /></div>}
              {analysis && tab === "evidence" && <div className="tab-panel"><div className="section-heading"><div><h3>Evidence trail</h3><p>Every recommendation is linked to a DataHub tool call</p></div>{settings.showFixtureBadges && <span className="provider-badge"><Database size={14} /> {analysis.provider === "mcp-fixture" ? "Verified MCP fixture" : "Live DataHub MCP"}</span>}</div><div className="evidence-list">{analysis.steps.map((step, index) => <div className="evidence-row" key={`${step.tool}-${index}`}><span className={`evidence-row__status ${step.status === "warning" ? "is-warning" : ""}`}>{step.status === "warning" ? <AlertTriangle size={14} /> : <Check size={14} />}</span><div><strong>{published && step.tool === "save_document" ? "Incident memory published" : step.label}</strong><p>{published && step.tool === "save_document" ? "Approved investigation is now searchable in DataHub" : step.detail}</p></div><code>{step.tool}</code><small>{step.durationMs} ms</small>{index < analysis.steps.length - 1 && <i />}</div>)}</div><WritebackPanel analysis={analysis} published={published} onPublished={(result) => setPublishedByIncident((current) => ({ ...current, [selected.id]: result }))} /></div>}
            </div>
          </>}</section>
        </div>}

        {view === "context" && <ContextGraphPage incidents={bootstrap.incidents} onOpenIncident={openIncident} />}
        {view === "policies" && <PoliciesPage policies={policies} onChange={setPolicies} onOpenIncident={openIncident} />}
        {view === "history" && <RunHistoryPage runs={runs} onOpenRun={(id) => { openIncident(id); void runAnalysis(id); }} />}
        {view === "settings" && <SettingsPage data={bootstrap} settings={settings} onSettingsChange={setSettings} onOpenConnection={() => setDrawerOpen(true)} onTest={syncMetadata} testing={syncing} lastSynced={lastSynced} />}
      </main>
      {drawerOpen && <ConnectionPanel data={bootstrap} onClose={() => setDrawerOpen(false)} />}
      {reportOpen && <ReportIncidentModal onClose={() => setReportOpen(false)} onCreated={addIncident} />}
      {toast && <div className={`toast ${toast.startsWith("Error:") ? "toast--error" : ""}`} role="status">{toast.startsWith("Error:") ? <AlertTriangle size={16} /> : <Check size={16} />}<span>{toast}</span></div>}
    </div>
  );
}
