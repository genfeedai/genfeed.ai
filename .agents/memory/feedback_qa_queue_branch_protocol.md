---
name: qa queue branch protocol
description: Stay on a named QA closeout branch; respect PR push policy; do not re-implement complete items
type: feedback
status: active
last_verified: 2026-08-12
topics: [workflow, git, qa, ci]
---

**Rule:** When an active `project_qa_*_closeout` file (or open PR body that owns that closeout) names a **queue branch**, treat that branch as the delivery lane for residual closeout work until the closeout file says otherwise.

**Why:** Side branches and thrashing pushes split launch blockers across PRs and force re-implementation of work already marked complete.

**How to apply:**

1. **Branch lock:** Work residual closeout items only on the named branch. Do not open a parallel `feat/*` for the same closeout unless the closeout file says to.
2. **Read closeout first:** Open `.agents/memory/project_qa_*_closeout.md` (or the PR body). **Do not re-implement** rows marked code-complete.
3. **Commits:** Prefer small conventional commits with tests for each residual fix.
4. **Push policy:** Follow the closeout / PR statement. If the PR is draft with commit-only iteration, do not push every micro-commit. Push when the closeout or operator says ready for CI.
5. **One PR:** One open PR owns the closeout. Do not open a second PR for the same launch blockers.
6. **Proof:** Residual hardening lands as tests or hermetic contracts on the queue branch, not chat-only claims.

**Done when:** A new session can continue from closeout memory + PR + tests without re-coding finished items or asking which branch owns the closeout.

**Personal multi-host routing rules** (including “don’t restate” guidance) live in **gitignored** `.agents/memory/local/` and/or global user memory — not in this public file.
