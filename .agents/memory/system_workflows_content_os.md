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
- Seed canonical system workflows idempotently and protect them from normal user update/delete paths.
- Let users duplicate system workflows into user/brand-owned editable workflows; duplicated workflows should resolve credentials through the selected user/brand account.
- Record workflow provenance on downstream content, messages, agent runs, and social actions.
- New hard-coded content cron/action/publish paths need an explicit documented exception. Infrastructure maintenance can still use platform cron when it is not tenant/product automation.
- UI, API, MCP, and agent controls should expose list, inspect, duplicate, trigger, run status, and run history for eligible workflows without allowing mutation of canonical system records.

**Canonical tracking:**
- Epic #1011: Productize System Workflows
- Epic #1009: Build Agent App Surface
- Epic #1010: Build Social Messages Surface
- PR #1008: Recovered workflow-backed social comment triggers

**Related architecture:**
- `architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md`
- `architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md`
