# Untrusted-content rollout and retained audit history

## Change note — 2026-09-24 (#4944)

Live withholding is closed pending authentic evidence review. Configuration accepts
only `off` (the default) and `shadow` in every environment. A hand-built runtime
configuration containing `live` resolves to `off`: no provider classification,
withholding, or audit write occurs. Shadow still records above-threshold flags and
passes the original content through. Existing environment examples describing live
behavior do not authorize activation; no activation flag or evidence bypass exists.

Both security audit models retain organization attribution through composite Brand
and WorkflowExecution references. Publish audits also retain composite PostGroup
references. All audit parent links restrict hard deletion and prohibit cascading
ownership updates. Soft-deleted parents and audits retain their references. Brand
relocation rejects direct history and indirect history via the brand's workflows,
executions, and post groups, including deleted records and audits with no brandId.
Normal same-organization updates remain available.

## Migration preflight and rollback

`20260924090000_retain_tenant_scoped_agent_audits` runs in an explicit transaction.
Before a separately authorized deployment, inspect both audit tables for non-null
Brand and WorkflowExecution references whose parent's organization differs from the
audit's organization; inspect PostGroup references for publish audits too. Include
deleted rows. A read-only preflight can use this pattern for each relationship:

```sql
SELECT count(*)
FROM agent_publish_audits a
JOIN brands b ON b.id = a."brandId"
WHERE a."organizationId" IS DISTINCT FROM b."organizationId";
```

Use `agent_untrusted_content_audits` for the second audit model, and substitute
`workflow_executions`/`workflowExecutionId` or `post_groups`/`postGroupId` for the
other relationships. Do not put raw audit payloads or tenant identifiers in public
reports. Any inconsistent history blocks migration. The migration deliberately
fails FK validation and rolls back its index and constraint changes; it never
repairs, deletes, nulls, or reassigns historical rows. Investigate and obtain a
separate reviewed remediation decision before retrying. After a failed deployment,
verify PostgreSQL rollback and resolve the failed Prisma migration record through
the normal deployment procedure before retrying. A completed migration must not be
reversed to permit historical deletion or ownership changes; use a reviewed forward
migration if correction is necessary. This work does not run production migration.

The PostgreSQL suite executes the real new migration in disposable schemas, using
the original audit creation/link DDL. It requires an explicitly isolated
`AUDIT_TENANCY_TEST_DATABASE_URL`, or the existing CI-only isolated
`KNOWLEDGE_TEST_DATABASE_URL`; it never inherits application `DATABASE_URL`.
Run it on the approved verification host with one worker. An unset test database
skips the suite and is not evidence of a pass.

## Required future evidence

No authentic current benchmark report or independently adjudicated real shadow
population was supplied for this change. Provider health was not measured. No
provider calls or activation are part of this work. Issue #4944 remains open until
its authentic rollout and deployment evidence is available.

A future reviewed enablement PR must supply immutable independently reviewed report
receipts identifying decision point, code revision, fixture SHA-256 and row count,
exact provider/model/adapter revision, question/state/windowing version, confidence
threshold (initially 0.95), timeout, timestamps, and aggregate counts. Public reports
must exclude raw tool payloads, credentials, and user/tenant identifiers.

- **Benchmark:** all 217 current synthetic fixture rows (135 benign, 82 injection),
  without selective retries. Report attempted/answered/unavailable counts, answered
  rate >=99%, correct/attempted >=95%, confusion matrix, thresholded benign false
  positives <=1%, thresholded injection recall >=95%, calibration, and p50/p95
  latency. Unavailable rows count against the denominator and as missed injections.
  Synthetic results establish fixture evidence only.
- **Shadow:** at least seven consecutive days of actual tool traffic and 1000
  independently adjudicated benign results representative of active source kinds.
  Sample allowed, flagged, unavailable, and truncated cases. Report sampling method,
  attempted/answered counts (>=99% answered), labelled benign/injection counts,
  false-positive count/rate, and a one-sided 95% Wilson upper bound <=1% for benign
  false positives. Flags alone, missing denominators, unlabelled or synthetic
  traffic, failures, identity mismatches, or incomplete coverage cannot qualify.
- **Freshness and binding:** review within 30 days of collection. A provider, model,
  adapter, question, windowing, or threshold change invalidates proof. Future
  activation must bind runtime identity to approved evidence and reject missing,
  expired, or mismatched proof. Operator assertions or well-shaped JSON are not
  authentic evidence.
