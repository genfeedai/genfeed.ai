---
name: p0_priority_not_label
description: P0/P1/P2/P3 are GitHub Project Priority values, not labels
type: feedback
status: active
last_verified: 2026-06-25
topics: [github, issue-tracking, workflow]
---

**Rule:** Track P0/P1/P2/P3 in GitHub Project #12's `Priority` field. Do not create priority labels.

**Why:** Project fields are the source of truth for priority. Label-based priority creates duplicate tracking and board drift.

**How to apply:**
- When Vincent says P0/P1/P2/P3, update Project #12 `Priority`.
- Use labels only for routing/classification such as `shipcode:agent:codex` or `release-e2e`.
- If project-field tooling is unavailable, leave a short issue comment noting the intended Project Priority update, then apply it when project access is available.
