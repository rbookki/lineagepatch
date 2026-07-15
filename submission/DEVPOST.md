# Devpost submission draft

## Project name

LineagePatch

## Tagline

From broken data contract to an explainable, reviewable patch.

## Inspiration

Data incidents are rarely isolated. A renamed field, delayed pipeline, or missing governance tag can quietly affect models, dashboards, and ML workflows several hops downstream. The hard part is not only finding the failure, but reconstructing its lineage, ownership, usage, and safest remediation path.

We built LineagePatch to help data teams investigate incidents with trusted metadata context instead of treating every failure as a blank prompt.

## What it does

LineagePatch is a metadata-aware incident response workflow powered by DataHub context. Given a schema, freshness, or governance incident, it:

- Resolves the affected entity, schema, owners, and assertions
- Traces direct and transitive downstream lineage
- Reviews usage evidence for the affected fields
- Explains the blast radius in plain language
- Generates a reviewable dbt or configuration patch
- Packages the proposed code as a downloadable patch for repository review
- Publishes an approved evidence summary back to DataHub as searchable incident memory
- Connects incidents to a cross-platform context graph, policy controls, and searchable run history
- Accepts validated incident reports and routes them directly into source-specific analysis

Every recommendation includes an evidence trail. Read-only investigation runs automatically; the write-back path requires both a server-side mutation gate and a second approval in the product.

## How we built it

The application uses React and TypeScript for the review workspace, with a Node.js service that protects credentials and coordinates analysis.

The DataHub adapter uses the official Model Context Protocol SDK with both stdio and streamable HTTP transports. For the demo, LineagePatch launches the official `mcp-server-datahub` process over stdio and connects it to a local DataHub Core v1.6.0 instance loaded with the `showcase-ecommerce` data pack. Its investigation calls `get_entities`, `list_schema_fields`, `get_lineage`, and `get_dataset_queries`.

For the customer schema event, DataHub returns 41 downstream assets across seven platforms, including dbt, Snowflake, Looker, Power BI, Tableau, S3, and a data job. LineagePatch turns that live response into a representative impact graph while preserving the full blast-radius totals, critical consumers, and owner count.

After review, a user can approve `save_document`. LineagePatch writes the evidence, recommendation, proposed artifact list, safety decision, and related asset URN back to DataHub. We verified the result through `search_documents`: the incident is returned as an `Analysis` document with searchable incident-response tags. No mutation happens during automatic analysis.

The repository also includes a deterministic local MCP fixture so judges can run the interface without Docker. Both modes perform a real MCP handshake and tool discovery. The same client can switch to DataHub Cloud's managed streamable HTTP endpoint through environment configuration. Access tokens stay on the server and are never exposed to the browser.

## Challenges we ran into

The biggest challenge was balancing automation with trust. Metadata can reveal relationships, but a production-safe recommendation also needs assumptions, evidence, and validation steps.

We addressed this by separating read-only investigation from mutation, linking every recommendation to its source evidence, and presenting proposed code as a diff that requires human review.

## Accomplishments that we're proud of

- A complete incident-to-remediation workflow running through the official DataHub MCP Server
- A live 41-asset downstream impact analysis grounded in DataHub Core lineage
- A complete read-reason-write loop using the official MCP Server
- Human-approved DataHub incident memory that later investigations can retrieve
- Three distinct incident types: schema drift, freshness breach, and governance propagation
- Complete context graph, policy control, run history, and settings workspaces
- Interactive table and column lineage impact visualization
- Incident-specific patch generation with human approval controls
- Downloadable patch bundles and committed sample outputs for judge review
- Stdio and streamable HTTP MCP transports with server-side credential isolation
- A deterministic MCP fixture for offline judging
- Responsive desktop and mobile interfaces
- Reproducible tests, build instructions, and an Apache 2.0 license

## What we learned

An effective incident response workflow depends on trustworthy organizational context. Lineage, ownership, schemas, governance signals, and query history materially improve both the quality and explainability of remediation decisions.

We also learned that preserving incident outcomes as reusable metadata can make the next responder faster, turning one investigation into durable organizational knowledge.

## What's next

Next we plan to turn the patch bundle into a draft pull request, add richer schema-contract checks, notify owners in Slack, and support remediation targets such as Airflow and Dagster. We also want to use retrieved incident memories to rank future fixes based on decisions the team has already approved.

## Built with

DataHub, DataHub Core, DataHub MCP Server, Model Context Protocol (MCP), TypeScript, React, Vite, Node.js, Express, Python, Docker, Vitest, dbt, SQL, Data Lineage, Incident Response

## Image gallery order

1. `media/02-impact-analysis.png` - DataHub-powered downstream blast radius
2. `media/03-reviewable-patch.png` - Human-reviewable remediation diff
3. `media/04-evidence-trail.png` - Traceable DataHub MCP evidence trail
4. `media/01-incident-overview.png` - Incident operations workspace
5. `media/05-context-graph.png` - Filterable cross-platform catalog context
6. `media/06-policy-controls.png` - Governed controls and linked incident review
