# INC-2048: Customer email field renamed

**Status:** Proposed remediation, pending code review  
**Severity:** critical  
**Source:** `postgres.order_entry.customers`  
**Signal:** `cust_email -> email_address`

## DataHub evidence

- 22 governed schema fields inspected
- 41 downstream assets across 7 platforms
- 3 critical paths prioritized
- 14 owner identities resolved

DataHub confirms `cust_email` in the governed baseline; the incident signal introduces `email_address` as the replacement.

## Recommendation

Add a compatibility alias at the source boundary, validate critical consumers first, and notify owners found across the returned lineage before rollout.

## Safety decision

Read-only investigation ran automatically. This memory is written only after explicit human approval; generated code remains unmerged and requires repository review.
