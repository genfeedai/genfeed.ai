---
name: p0_priority_not_label
description: P0/P1/P2/P3 are native organization Issue Priority values, not labels or project-local duplicates
type: feedback
status: active
last_verified: 2026-08-30
topics: [github, issue-tracking, workflow]
---

**Rule:** Track P0/P1/P2/P3 in the `genfeedai` organization's native Issue Field named `Priority`. Surface it on Project #12; do not create priority labels or a project-local Priority duplicate.

**Every board item carries a Priority.** A card with an empty `Priority` is a board defect, in every
column — Backlog, In Progress, Human Review, Done, and Deferred alike. Set it when the item joins
the board, not later. Epics are not exempt; an epic inherits the priority of the work it gates.

**Why:** Native Issue Fields are the source of truth for priority. Project-local fields and label-based priority create duplicate tracking and drift.

**How to apply:**
- When Vincent says P0/P1/P2/P3, update the native issue `Priority`; Project #12 displays the same value.
- Use labels only for routing/classification. `codex:automation` marks Codex queue work, `claude:routine` marks Claude routine work, and `shipcode:agent:codex` is reserved for ShipCode routing.
- If native issue-field tooling is unavailable, leave a short issue comment noting the intended Priority update, then apply it when organization field access is available.
