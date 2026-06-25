---
name: epic_status_on_child_start
description: Move parent epics to In Progress as soon as any child issue starts
type: feedback
status: active
last_verified: 2026-06-25
topics: [github, project-board, workflow]
---

**Rule:** Parent epic issues move to GitHub Project status `In Progress` as soon as any child issue is started or completed.

**Why:** If a child has started, the epic is no longer backlog/todo work. Leaving the parent in `Todo` creates board drift and hides active work.

**How to apply:**
- When moving a child issue to `In Progress`, `Human Review`, or `Done`, check its parent epic.
- If the parent epic is still `Backlog`, `Todo`, or `Deferred`, move it to `In Progress`.
- Keep the parent open until all required child issues and epic-level verification are complete.
