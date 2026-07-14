# Three-minute demo script

## 0:00-0:20 - The incident

"A single column rename can break transformations, dashboards, and ML features several hops downstream. LineagePatch uses DataHub context to turn that incident into an explainable remediation plan."

Show the incident list and select **Customer email field renamed**. Point out the signal, source asset, and owner.

## 0:20-1:05 - Trace the impact

Click **Run impact analysis**.

"LineagePatch resolves the source entity, compares schema fields, and traverses downstream lineage through the official DataHub MCP Server. In the live DataHub Core catalog, it finds 41 downstream assets across seven platforms."

Point out the three critical paths, 14 owner identities, and the confidence indicator. Briefly read the recommendation.

## 1:05-1:40 - Review the patch

Open **Proposed patch**.

"Instead of silently changing production, LineagePatch creates a reviewable compatibility patch. It adopts the new email_address field, preserves the old name for one release window, updates the schema contract, and adds validation for the governed field."

Switch between the SQL and YAML files, then point out the patch download button.

## 1:40-2:30 - Verify and write back

Open **Evidence trail**.

"Every recommendation is traceable. The evidence trail records the DataHub tools used to resolve metadata, compare fields, and inspect lineage and usage. Automatic analysis is read-only."

Select **Publish to DataHub**, pause on the approval scope, then select **Approve write**.

"Only this explicit approval calls save_document. The investigation, recommendation, proposed artifacts, and related asset are now searchable DataHub context for the next responder."

Briefly show the new document in DataHub search.

## 2:30-2:47 - Show another scenario

Select **Freshness contract breached** and run the analysis.

"LineagePatch adapts the workflow to freshness and governance incidents rather than returning the same generic response."

Show the orders-specific graph and one-file patch count.

## 2:47-3:00 - Close

"LineagePatch turns DataHub from a passive catalog into active, explainable operational context. From broken data contract to a patch your team can actually review."
