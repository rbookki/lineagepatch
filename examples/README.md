# Sample output

These files are the review package generated for `INC-2048`, a governed rename from `cust_email` to `email_address`.

- `models/staging/stg_customers.sql` preserves a compatibility alias for one release window.
- `models/staging/stg_customers.yml` updates the schema contract and retains the deprecated field.
- `inc-2048-lineagepatch.diff` is the portable patch bundle available from the application.
- `incident-memory.md` is the evidence summary that can be published to DataHub after explicit approval.

The artifacts are proposals. LineagePatch never merges code or writes metadata during automatic analysis.
