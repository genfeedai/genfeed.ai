---
name: qa queue branch protocol
description: Stay on the named QA queue branch; commit-only while CI thrash is forbidden; do not re-implement closeout items
type: feedback
status: active
last_verified: 2026-08-12
topics: [workflow, git, qa, ci, multi-agent]
---

**Rule:** When Vincent (or an active `project_qa_*_closeout` file) names a **QA queue branch**, all agents treat that branch as the only delivery lane for that closeout until he says otherwise.

**Why:** Side branches, stash hops, and drive-by master features split launch blockers across PRs, thrash Actions when every commit is pushed, and force Vincent to restate “stay on qa/…” and “don’t push.”

**How to apply:**

1. **Branch lock:** Work only on the named branch (example: `qa/260812`). Do not create `feat/*` / `hotfix/*` for residual closeout items unless he asks.
2. **Read closeout memory first:** Open `.agents/memory/project_qa_*_closeout.md` (or the file linked from MEMORY.md). **Do not re-implement** rows marked code-complete.
3. **Commit cadence:** Prefer small conventional commits after each residual fix + tests.
4. **Push policy:** If he said **no push / deploy owns CI / avoid thrash**, commit locally only. Push once when he says push or “ready for CI.”
5. **PR:** One draft/ready PR owns the closeout (`Closes #…` only for issues whose acceptance is met in this PR). Do not open a second PR for the same launch blockers.
6. **Board:** Move claimed issues to Project #12 **In Progress** when you take them; leave human sale-path issues human.
7. **Tests over chat:** Residual hardening = tests + hermetic contracts on the queue branch, not a new design doc.

**Done when:** A new agent session on the queue branch can continue residuals from closeout memory + PR without asking “which branch?” or re-coding finished launch blockers.
