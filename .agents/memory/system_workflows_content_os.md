---
name: system_workflows_content_os
description: Content automation uses immutable system workflows instead of hard-coded publish/action/cron paths
type: project
status: active
last_verified: 2026-08-28
topics: [workflows, automation, publishing, social, agent, messages]
---

**Rule:** Genfeed product operations execute as workflows. Hidden system workflows are app-owned graphs that run through the normal workflow engine but are not listed or mutated in customer app surfaces. User-visible official templates are separate installable graphs whose tenant-owned copies are editable.

**Why:** Vincent wants Genfeed to become a content-specific n8n. Hidden publish actions, social reply/DM actions, agent handoffs, and product crons make automation opaque and impossible for users to duplicate or customize safely.

**How to apply:**
- Use workflows as the executable unit for scheduled content work, generation, publishing, social reply/DM actions, comment-trigger automation, Agent/MCP actions, public tools, and recurring product automations.
- Keep hidden system workflow graphs in a code catalog and execute them without creating customer-visible system clones.
- Keep user-visible official templates in a separate installable catalog. Installing one creates a tenant-owned editable workflow with template provenance.
- Do not wrap direct callbacks in workflow-shaped provenance records. A system workflow must execute its graph through the workflow engine.
- Record workflow provenance on downstream content, messages, agent runs, and social actions.
- New hard-coded content cron/action/publish paths need an explicit documented exception. Infrastructure maintenance can still use platform cron when it is not tenant/product automation.
- UI, API, MCP, and Agent controls may expose user-authored workflows and user-visible official templates. Hidden system workflows remain internal while retaining normal execution/run provenance.
- See [decisions-workflow-only-action-execution.md](decisions-workflow-only-action-execution.md) for the hard-cut execution contract.

**Canonical tracking:**
- Epic #1011: Productize System Workflows
- Epic #1009: Build Agent App Surface
- Epic #1010: Build Social Messages Surface
- PR #1008: Recovered workflow-backed social comment triggers

**Related architecture:**
- `architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md`
- `architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md`
