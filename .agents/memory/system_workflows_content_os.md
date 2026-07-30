---
name: system_workflows_content_os
description: Content automation uses immutable system workflows instead of hard-coded publish/action/cron paths
type: project
status: active
last_verified: 2026-07-01
topics: [workflows, automation, publishing, social, agent, messages]
---

**Rule:** Genfeed content automation should be modeled as system workflows by default. System workflows are app-owned, immutable canonical workflows that users can inspect and duplicate, but cannot delete or mutate in place.

**Why:** Vincent wants Genfeed to become a content-specific n8n. Hidden publish actions, social reply/DM actions, agent handoffs, and product crons make automation opaque and impossible for users to duplicate or customize safely.

**How to apply:**
- Use workflows as the canonical executable unit for scheduled content work, publish actions, social reply/DM actions, comment-trigger automation, and recurring agent/product automations.
- Keep system workflow **graphs in a code catalog** (`GET /workflows?source=system-catalog`). Do **not** clone the full system set at organization creation.
- Tenants **install** the workflows they want (`POST /workflows` with `templateId` + `sourceType: "system-catalog"`), which creates a tenant-owned editable workflow with catalog provenance.
- Operator/self-host scripts may still call `WorkflowTemplateSeederService` for backfill; product system-action wrappers may still create-on-demand as a fail-closed path.
- Record workflow provenance on downstream content, messages, agent runs, and social actions.
- New hard-coded content cron/action/publish paths need an explicit documented exception. Infrastructure maintenance can still use platform cron when it is not tenant/product automation.
- UI, API, MCP, and agent controls should expose catalog list, install, inspect, duplicate, trigger, run status, and run history for eligible workflows.

**Canonical tracking:**
- Epic #1011: Productize System Workflows
- Epic #1009: Build Agent App Surface
- Epic #1010: Build Social Messages Surface
- PR #1008: Recovered workflow-backed social comment triggers

**Related architecture:**
- `architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md`
- `architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md`
