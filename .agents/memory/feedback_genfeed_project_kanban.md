---
name: genfeed_project_kanban
description: Use Genfeed.ai project #12 as the canonical kanban; never select work from closed Mission Control #11
type: feedback
status: active
last_verified: 2026-06-08
topics: [github, project-board, automation, workflow]
---

**Rule:** Use GitHub Project `genfeedai` project #12, `Genfeed.ai`, as the canonical kanban for Genfeed work. Do not select or mutate work items from closed project #11, `Mission Control`.

**Why:** Project #11 is closed but still contained duplicate/stale project items. A feature automation run selected from #11 because its prompt explicitly named Mission Control project #11. That caused workflow status drift: the same issues existed in #12 with different statuses.

**How to apply:**
- For Genfeed issue selection, start from `https://github.com/orgs/genfeedai/projects/12`.
- Treat #12 status/priority/area/surface fields as canonical.
- Never use #11 `Owner=Codex` as a selection signal. Project #12 does not currently have the same Owner field; prefer issue labels such as `shipcode:agent:codex` and project Priority/Status.
- If an automation prompt still names project #11, flag the prompt as stale and use #12 only.
- Do not re-add Genfeed repo issues to closed project #11.
