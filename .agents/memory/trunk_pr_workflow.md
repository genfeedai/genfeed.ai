---
name: Ship autonomously on short-lived branches; master is PR-only
description: Trunk-based — commit/push/PR freely when work is done; master is PR-only; always secret-scan before commit
type: feedback
---

**Rule:** This repo is **trunk-based** — `master` is the single trunk. When session work is complete, ship it autonomously: commit, push the short-lived branch, and open a PR to `master`. Per-commit approval is NOT required. The review gate is the PR itself (reviewers + required CI), so opening the PR *is* the handoff.

**Why:** The safety gate is PR review plus required CI on `master`, backed by a staged-content secret scan before every commit. Per-commit approval on short-lived branches adds friction without improving that gate.

**How to apply:**
- Committing on short-lived / feature / worktree branches: just do it. Don't ask.
- Pushing a short-lived branch to its `origin/<branch>`: fine without approval.
- Opening a PR to `master` when work is done: do it autonomously. Reviewers are on it anyway.
- Pushing **directly** to `origin/master`: **never** — PR only, no exceptions.
- Force-pushing anywhere other than your own short-lived branch: ASK. Never force-push master.
- Before ANY commit, regardless of branch: scan staged content for `.env*`, `secrets/`, tokens, private keys, AWS/GCP/Stripe/OpenAI/etc. credentials. If found, STOP and flag — do not commit the file even if it was explicitly staged. Worst outcome is leaking secrets to a public repo indexed before rotation.
- New worktrees / branches: cut off `master` for clean-slate work (master is the trunk).
