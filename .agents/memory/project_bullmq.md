---
name: BullMQ Refactor
description: Issue #84 — move 32 @Processor decorators from API service to Workers service
type: project
---

**Why:** API process runs 32 BullMQ job processors alongside HTTP handlers. Heavy jobs (workflow execution, agent runs, content pipeline) eat CPU that should serve requests. Workers process has zero processors — only @Cron jobs.

**How to apply:** When adding new processors, put them in Workers (apps/server/workers), not API. Issue #84 tracks the migration of existing processors.
