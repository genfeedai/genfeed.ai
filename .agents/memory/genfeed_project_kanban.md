---
name: genfeed_project_kanban
description: Use Genfeed.ai project #12 as the canonical kanban
type: feedback
status: active
last_verified: 2026-06-30
topics: [github, project-board, automation, workflow]
---

**Rule:** Use GitHub Project `genfeedai` project #12, `Genfeed.ai`, as the canonical kanban for Genfeed work.

**Why:** This is the active project board for Genfeed work and the source of truth for project Status, Priority, Area, Surface, Blast radius, Complexity, Start, and Release fields.

**How to apply:**
- For Genfeed issue selection and board audits, start from `https://github.com/orgs/genfeedai/projects/12`.
- Treat #12 status/priority/area/surface fields as canonical.
- Prefer queue labels first, then project metadata: `codex:automation` for Codex pickup, `claude:routine` for Claude routine pickup, then milestone, Release/Start dates, Priority, Status, and readiness evidence. `shipcode:agent:codex` is for ShipCode routing only.
- When automation opens or audits a PR linked to an issue, mirror the issue's queue labels (`codex:automation` / `claude:routine`) and existing classification labels onto the PR for list-view filtering. Do not invent labels from project fields.
- When writing memory, prompts, summaries, or reports, state the active target directly.
