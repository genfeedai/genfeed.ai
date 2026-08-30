---
name: genfeed_project_kanban
description: Use Genfeed.ai project #12 for workflow Status and native issue fields for shared metadata
type: feedback
status: active
last_verified: 2026-08-30
topics: [github, project-board, automation, workflow]
---

**Rule:** Use GitHub Project `genfeedai` project #12, `Genfeed.ai`, as the canonical kanban. Keep workflow `Status` project-scoped and keep shared planning metadata on native organization Issue Fields.

**Why:** Project #12 is the active workflow board. Native Issue Fields keep Priority, Area, Surface, Blast radius, Complexity, Start date, Target date, and Release track attached to the issue across every project and eliminate duplicate sidebar values. GitHub Issue Type owns Feature/Bug/Task.

**How to apply:**
- For Genfeed issue selection and board audits, start from `https://github.com/orgs/genfeedai/projects/12`.
- Treat Project #12 `Status` as canonical workflow state.
- Treat native organization Issue Fields as canonical for Priority, Area, Surface, Blast radius, Complexity, Start date, Target date, and Release track; surface those fields as columns on Project #12.
- Treat GitHub Issue Type as canonical for Feature/Bug/Task; do not recreate `Work type` as a project field.
- Prefer queue labels first, then project metadata: `codex:automation` for Codex pickup, `claude:routine` for Claude routine pickup, then milestone, Release/Start dates, Priority, Status, and readiness evidence. `shipcode:agent:codex` is for ShipCode routing only.
- When automation opens or audits a PR linked to an issue, mirror the issue's queue labels (`codex:automation` / `claude:routine`) and existing classification labels onto the PR for list-view filtering. Do not invent labels from project fields.
- When writing memory, prompts, summaries, or reports, state the active target directly.
