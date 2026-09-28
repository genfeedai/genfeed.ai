---
name: BullMQ Processor Placement
description: API no longer owns BullMQ processors; put new processors in workers or the owning service
type: project
status: resolved
last_verified: 2026-07-02
---

**Enforced:** `bun run check:architecture` runs `scripts/architecture/check-no-api-bullmq-processors.ts`, which fails the build if any `@Processor(...)` or `WorkerHost` shows up under `apps/server/api/src`. Put new product/background processors in `apps/server/workers`, or in a dedicated owning runtime service when the queue is service-local (for example files/clips).

**Workflow cron schedules (#1091):** workflow schedules are BullMQ Job Schedulers on the `workflow-execution` queue (`workflow-schedule:{workflowId}`), upserted/removed by the API producer (`WorkflowExecutionQueueService`) and fired as `scheduled-fire` jobs in workers. No in-process CronJobs, no Redis fire-window lock, no reconciler cron.
