---
name: genfeed_project_kanban
description: Use Genfeed.ai project #12 as the canonical kanban
type: feedback
status: active
last_verified: 2026-06-25
topics: [github, project-board, automation, workflow]
---

**Rule:** Use GitHub Project `genfeedai` project #12, `Genfeed.ai`, as the canonical kanban for Genfeed work.

**Why:** This is the active project board for Genfeed work and the source of truth for project Status, Priority, Area, Surface, Blast radius, Complexity, Start, and Release fields.

**How to apply:**
- For Genfeed issue selection and board audits, start from `https://github.com/orgs/genfeedai/projects/12`.
- Treat #12 status/priority/area/surface fields as canonical.
- Prefer issue labels such as `shipcode:agent:codex` and project Priority/Status for issue selection.
- When writing memory, prompts, summaries, or reports, state the active target directly.
