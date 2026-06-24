# ADR: Workflow-Canonical Dynamic Scheduling

## Status

Accepted

## Decision

Dynamic recurring automation must be workflow-backed by default.

- use static Nest/API cron only for platform and maintenance jobs
- use workflow schedule triggers for tenant-scoped recurring automation
- treat the workflow as the canonical executable unit
- treat agents, tasks, and automations as product-facing views over a scheduled
  workflow
- do not introduce new product features on the generic `cron-jobs` subsystem

## Architecture Rule

For new and ongoing platform work:

- a workflow is the executable unit
- schedule metadata belongs to the workflow or to a workflow-owned trigger model
- the scheduler invokes workflow execution, not ad hoc feature-specific cron
  handlers
- frontend surfaces should present tasks, agents, or automations, but those
  objects must compile down to scheduled workflows

Raw cron jobs are not a primary product abstraction.

## Current Repo State

The repo currently contains two scheduling models:

- workflow-native scheduling via `WorkflowSchedulerService`
- a legacy `cron-jobs` subsystem retained for compatibility reads, migration,
  and workflow-adapter execution of migrated rows

The strategic path is workflow scheduling.

The `cron-jobs` subsystem should be treated as legacy because:

- it duplicates workflow scheduling concerns
- it exposes raw cron infrastructure as a product surface
- it creates a second execution model for recurring automation
- `processDueJobs()` is not the preferred scheduler path for new product work

The legacy product surface is retired:

- `/lab/cron-jobs` redirects to workflow scheduling
- `POST`/`PATCH`/pause/resume/delete/run-now cron-job API routes return `410`
- SDK mutation methods fail before making HTTP calls
- new product code must not create legacy cron rows or call legacy mutation APIs

Ad insights aggregation is explicitly classified as platform scheduling:

- `cron.ad-insights` runs once per weekly platform window, not once per
  organization
- the aggregation queue payload carries `scope: "platform"` plus a deterministic
  weekly idempotency key
- the worker processor rejects non-platform scope
- the data contract is public-scope ad performance with k-anonymity across at
  least five organizations, so a per-org workflow would duplicate global work
  and weaken the anonymity boundary

## Consequences

### Required for new work

- new recurring product automation must be represented as a scheduled workflow
- new agent/task scheduling UX must create or update workflow schedules
- new backend product automation should not add new `CronJobType` variants

### Allowed going forward

- keep system `@Cron(...)` jobs for platform responsibilities
- keep webhook and manual workflow triggers as first-class trigger types
- keep temporary legacy compatibility where migration is not complete

### Not allowed going forward

- shipping new user-facing features on `/cron-jobs`
- exposing raw cron-job management as the canonical UX for automations
- building a second dynamic scheduler parallel to workflow scheduling

## Enforcement

Run `bun run check:cron-boundary` to verify static Nest `@Cron(...)`
decorators are either reviewed platform/maintenance jobs or tracked tenant
automation migrations. `bun run check:architecture` runs the same guard in CI.

When adding recurring tenant-product behavior, create or update a scheduled
workflow instead of adding a new static cron decorator. If a static cron is
truly platform/maintenance work, add it to the reviewed platform allowlist in
`scripts/architecture/check-platform-cron-boundary.ts` with a concrete reason.
