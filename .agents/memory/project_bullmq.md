---
name: BullMQ Processor Placement
description: API no longer owns BullMQ processors; put new processors in workers or the owning service
type: project
status: resolved
last_verified: 2026-07-02
---

**Why:** The old #84 concern was API process contention from BullMQ processors running beside HTTP handlers. Current source has no `@Processor(...)` decorators in `apps/server/api`; most product processors now live under `apps/server/workers/src/processors/api/**`, while file/clip-specific processors remain in their owning services.

**How to apply:** Do not add BullMQ processors to `apps/server/api`. Put new product/background processors in `apps/server/workers`, or in a dedicated owning runtime service when the queue is service-local (for example files/clips). Keep the API responsible for HTTP orchestration and queue enqueueing.

**Workflow cron schedules (#1091):** workflow schedules are BullMQ Job Schedulers on the `workflow-execution` queue (`workflow-schedule:{workflowId}`), upserted/removed by the API producer (`WorkflowExecutionQueueService`) and fired as `scheduled-fire` jobs in workers. No in-process CronJobs, no Redis fire-window lock, no reconciler cron.
