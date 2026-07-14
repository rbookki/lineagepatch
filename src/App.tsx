import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  CircleGauge,
  Clock3,
  Code2,
  Database,
  Download,
  FileDiff,
  GitBranch,
  History,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
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

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [selectedId, setSelectedId] = useState("INC-2048");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<ViewTab>("impact");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState<PublishResult | null>(null);

  useEffect(() => {
    fetch("/api/bootstrap")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the workspace.");
        return response.json();
      })
      .then((data: BootstrapData) => setBootstrap(data))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const incidents = useMemo(() => {
    if (!bootstrap) return [];
    return [...bootstrap.incidents]
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .filter((incident) => `${incident.id} ${incident.title} ${incident.source}`.toLowerCase().includes(query.toLowerCase()));
  }, [bootstrap, query]);

  const selected = bootstrap?.incidents.find((incident) => incident.id === selectedId) ?? incidents[0];

  function selectIncident(incident: Incident) {
    setSelectedId(incident.id);
    setAnalysis(null);
    setPublished(null);
    setTab("impact");
  }

  async function runAnalysis() {
    if (!selected) return;
    setRunning(true);
    setError("");
    setAnalysis(null);
    setPublished(null);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: selected.id }),
      });
      if (!response.ok) throw new Error("Impact analysis could not be completed.");
      setAnalysis(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unknown analysis error");
    } finally {
      setRunning(false);
    }
  }

  if (!bootstrap && !error) {
    return <div className="app-loader"><LoaderCircle className="spin" size={24} /><span>Opening workspace</span></div>;
  }

  if (!bootstrap) {
    return <div className="app-loader app-loader--error"><AlertTriangle size={24} /><span>{error}</span></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand__mark"><GitBranch size={19} /></span><span>LineagePatch</span></div>
        <nav aria-label="Primary navigation">
          <button className="nav-item is-active"><Activity size={17} /><span>Incidents</span><small>3</small></button>
          <button className="nav-item"><GitBranch size={17} /><span>Context graph</span></button>
          <button className="nav-item"><ShieldCheck size={17} /><span>Policies</span></button>
          <button className="nav-item"><History size={17} /><span>Run history</span></button>
        </nav>
        <div className="sidebar__bottom">
          <button className="connection-chip" onClick={() => setDrawerOpen(true)}>
            <span className={`status-dot ${analysis?.fallbackReason ? "status-dot--fallback" : "status-dot--live"}`} />
            <span><strong>DataHub</strong><small>{analysis?.fallbackReason ? "Fixture fallback active" : bootstrap.connection.label}</small></span>
            <ChevronDown size={14} />
          </button>
          <button className="nav-item"><Settings2 size={17} /><span>Settings</span></button>
          <div className="profile"><span>RM</span><div><strong>R. Metadata</strong><small>Data platform</small></div></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div><span className="eyebrow">OPERATIONS</span><h1>Incident review</h1></div>
          <div className="topbar__actions">
            <button className="button button--quiet" title="Sync metadata"><RefreshCw size={16} /> Sync metadata</button>
            <button className="button button--primary"><AlertTriangle size={16} /> Report incident</button>
          </div>
        </header>

        <div className="workspace">
          <section className="incident-rail" aria-label="Incident list">
            <div className="rail-header"><div><h2>Open incidents</h2><span>{incidents.length} visible</span></div><button className="icon-button" title="Filter incidents"><CircleGauge size={17} /></button></div>
            <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search incidents" /></label>
            <div className="incident-list">
              {incidents.map((incident) => (
                <button key={incident.id} className={`incident-row ${incident.id === selected?.id ? "is-active" : ""}`} onClick={() => selectIncident(incident)}>
                  <div className="incident-row__top"><span className={`severity severity--${incident.severity}`}>{incident.severity}</span><small>{timeAgo(incident.detectedAt)}</small></div>
                  <strong>{incident.title}</strong>
                  <span>{incident.source}</span>
                  <div className="incident-row__footer"><small>{incident.id}</small><small>{incident.owner}</small></div>
                </button>
              ))}
            </div>
          </section>

          <section className="review-pane">
            {selected && <>
              <div className="review-heading">
                <div><div className="review-heading__meta"><span className={`severity severity--${selected.severity}`}>{selected.severity}</span><span>{selected.id}</span><span><Clock3 size={13} /> {timeAgo(selected.detectedAt)}</span></div><h2>{selected.title}</h2><p>{selected.summary}</p></div>
                <button className="button button--primary" onClick={runAnalysis} disabled={running}>{running ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{running ? "Analyzing" : analysis ? "Run again" : "Analyze impact"}</button>
              </div>

              <div className="signal-strip">
                <div><span>Signal</span><strong><Code2 size={15} /> {selected.signal}</strong></div>
                <div><span>Source</span><strong><Database size={15} /> {selected.source}</strong></div>
                <div><span>Owner</span><strong><Users size={15} /> {selected.owner}</strong></div>
              </div>

              <div className="tabs" role="tablist">
                <button className={tab === "impact" ? "is-active" : ""} onClick={() => setTab("impact")} role="tab">Impact graph</button>
                <button className={tab === "patch" ? "is-active" : ""} onClick={() => setTab("patch")} role="tab">Proposed patch {analysis && <span>{analysis.patches.length}</span>}</button>
                <button className={tab === "evidence" ? "is-active" : ""} onClick={() => setTab("evidence")} role="tab">Evidence trail {analysis && <span>{analysis.steps.length}</span>}</button>
              </div>

              <div className="content-area">
                {analysis?.fallbackReason && <div className="fallback-banner"><AlertTriangle size={15} /><span>{analysis.fallbackReason}</span></div>}
                {!analysis && <EmptyAnalysis onRun={runAnalysis} running={running} />}
                {analysis && tab === "impact" && <div className="impact-layout">
                  <div className="impact-main">
                    <div className="section-heading"><div><h3>Downstream blast radius</h3><p>Table and column lineage, 3 hops</p></div><span className="confidence"><Check size={14} /> {analysis.confidence}% confidence</span></div>
                    <LineageGraph result={analysis} />
                    <div className="analysis-note"><span><Sparkles size={17} /></span><div><strong>Why this matters</strong><p>{analysis.explanation}</p></div></div>
                    <div className="contract-evidence"><div><span className="eyebrow">CONTRACT EVIDENCE</span><strong>{analysis.contractEvidence.signal}</strong><p>{analysis.contractEvidence.summary}</p></div><dl><div><dt>Fields</dt><dd>{analysis.context.fieldsInspected}</dd></div><div><dt>Queries</dt><dd>{analysis.context.queryReferences}</dd></div><div><dt>Platforms</dt><dd>{analysis.context.platforms}</dd></div></dl></div>
                  </div>
                  <aside className="impact-summary">
                    <h3>Impact summary</h3>
                    <div className="metric-grid"><div><strong>{analysis.blastRadius.assets}</strong><span>affected assets</span></div><div><strong>{analysis.blastRadius.critical}</strong><span>critical paths</span></div><div><strong>{analysis.blastRadius.owners}</strong><span>owners to notify</span></div></div>
                    <div className="recommendation"><span className="eyebrow">RECOMMENDATION</span><p>{analysis.recommendation}</p></div>
                    <button className="button button--secondary button--wide" onClick={() => setTab("patch")}><FileDiff size={16} /> Review proposed patch <ArrowRight size={15} /></button>
                  </aside>
                </div>}
                {analysis && tab === "patch" && <div className="tab-panel"><div className="section-heading"><div><h3>Reviewable remediation</h3><p>Derived from schema, lineage and query evidence</p></div><span className="review-badge">Human approval required</span></div><PatchViewer incidentId={analysis.incident.id} patches={analysis.patches} /></div>}
                {analysis && tab === "evidence" && <div className="tab-panel"><div className="section-heading"><div><h3>Evidence trail</h3><p>Every recommendation is linked to a DataHub tool call</p></div><span className="provider-badge"><Database size={14} /> {analysis.provider === "mcp-fixture" ? "Verified MCP fixture" : "Live DataHub MCP"}</span></div><div className="evidence-list">{analysis.steps.map((step, index) => <div className="evidence-row" key={`${step.tool}-${index}`}><span className={`evidence-row__status ${step.status === "warning" ? "is-warning" : ""}`}>{step.status === "warning" ? <AlertTriangle size={14} /> : <Check size={14} />}</span><div><strong>{published && step.tool === "save_document" ? "Incident memory published" : step.label}</strong><p>{published && step.tool === "save_document" ? "Approved investigation is now searchable in DataHub" : step.detail}</p></div><code>{step.tool}</code><small>{step.durationMs} ms</small>{index < analysis.steps.length - 1 && <i />}</div>)}</div><WritebackPanel analysis={analysis} published={published} onPublished={setPublished} /></div>}
              </div>
            </>}
          </section>
        </div>
      </main>
      {drawerOpen && <ConnectionPanel data={bootstrap} onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}
