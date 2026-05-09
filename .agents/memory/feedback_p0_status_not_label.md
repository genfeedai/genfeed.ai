---
name: p0_status_not_label
description: P0 is a status, not a GitHub label; do not create priority labels
type: feedback
status: active
last_verified: 2026-05-09
topics: [github, issue-tracking, workflow]
---

**Rule:** Do not create or use priority labels such as `priority:p0`. P0 is tracked as issue status, not as a label.

**Why:** The repo’s label taxonomy was cleaned up to remove priority labels. Reintroducing them creates tracking drift and reverses that cleanup.

**How to apply:**
- When the user says P0/P1/etc., represent it in the issue status system.
- If no project/status field is available from the current tooling, put `Status: P0` in the issue body and do not create a label.
- Never create labels with names like `priority:p0`, `priority:p1`, or similar.
