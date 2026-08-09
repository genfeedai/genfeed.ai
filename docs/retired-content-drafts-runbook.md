# Retired content migration

`ContentDraft` runtime writes were cut over to canonical, reviewable `Post`
records in issue #2643. The database migration marks the physical
`content_drafts` table as a retired archive without renaming or deleting it, so
rolling deployments cannot break older instances before the runtime cutover.

## Audited runtime inventory

- Producers: Content Gateway skill runs, Content Engine plan execution, and
  Agent Strategy autopilot. They now create or reuse canonical Posts through
  `ReviewablePostsService`; manual-review batches link an owned Post instead of
  copying it.
- Orchestrators: the Content Engine cron and content-production workflow no
  longer run a second ContentDraft auto-approval loop.
- Consumers removed: ContentDraft REST controllers/DTOs/service/module, queue
  review service, serializers, enum, Prisma runtime model, brand cleanup hooks,
  and agent artifact write/read contracts.
- References migrated: ContentPlanItem payloads and trend-remix lineage use
  `postId`; historical physical references are relinked by the operator job.
- Row dispositions: `convertible`, `already_migrated`, `retained_deleted`, and
  explicit `blocked_*` ownership, tenant, ContentRun, content, reviewer,
  published-target, status, or concurrent-change classifications.

Run the classifier before any live migration:

```bash
bun --filter @genfeedai/api migrate:retired-content:dry
```

The newline-delimited report contains only row, tenant, disposition, and mapped
Post identifiers, followed by an aggregate summary; it never includes draft
content and remains memory-bounded for large archives. Review every `blocked_*`
or `retained_deleted` classification. Convertible rows preserve tenant, brand,
owner, content run, generation provenance, timestamps, media URLs, and old
review state. Approved rows receive a new canonical Post version pin before
their approval decision is restored; the old ContentDraft pin identifier stays
in Post provenance for auditability.

After reviewing the report, run:

```bash
bun --filter @genfeedai/api migrate:retired-content
```

The live run is idempotent and resumable. It uses a tenant-scoped Post
idempotency key and source-value guards. It also relinks trend lineage and
content-plan item references. A concurrent source edit or ambiguous row makes
the command fail after retaining that row; resolve the reported blocker and
rerun. Do not drop the archive until a reviewed report has converged with zero
retained or blocked rows.
