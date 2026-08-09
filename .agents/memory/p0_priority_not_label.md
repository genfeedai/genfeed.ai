---
name: p0_priority_not_label
description: P0/P1/P2/P3 are GitHub Project Priority values, not labels
type: feedback
status: active
last_verified: 2026-08-09
topics: [github, issue-tracking, workflow]
---

**Rule:** Track P0/P1/P2/P3 in GitHub Project #12's `Priority` field. Do not create priority labels.

**Every board item carries a Priority.** A card with an empty `Priority` is a board defect, in every
column — Backlog, In Progress, Human Review, Done, and Deferred alike. Set it when the item joins
the board, not later. Epics are not exempt; an epic inherits the priority of the work it gates.

**Why:** Project fields are the source of truth for priority. Label-based priority creates duplicate tracking and board drift.

**How to apply:**
- When Vincent says P0/P1/P2/P3, update Project #12 `Priority`.
- Use labels only for routing/classification. `codex:automation` marks Codex queue work, `claude:routine` marks Claude routine work, and `shipcode:agent:codex` is reserved for ShipCode routing.
- If project-field tooling is unavailable, leave a short issue comment noting the intended Project Priority update, then apply it when project access is available.
