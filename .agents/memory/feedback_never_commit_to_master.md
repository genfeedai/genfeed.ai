---
name: Ship autonomously on short-lived branches; master is PR-only
description: Trunk-based — commit/push/PR freely when work is done; never push direct to master; always secret-scan before commit
type: feedback
---

**Rule:** This repo is **trunk-based** — `master` is the single trunk. When session work is complete, ship it autonomously: commit, push the short-lived branch, and open a PR to `master`. Per-commit approval is NOT required. The review gate is the PR itself (reviewers + required CI), so opening the PR *is* the handoff.

**Why:** A prior incident pushed `.env.production` secrets to `master` on this public repo — that's the origin of the old "never commit/push without explicit approval" rule. The real safety gate is (a) never pushing direct to master, and (b) scanning every commit for secrets. Per-commit approval on a throwaway branch is friction with zero safety value, and PR review covers the human gate. The old `develop → staging → master` flow is dead — see CLAUDE.md "Git Workflow".

**How to apply:**
- Committing on short-lived / feature / worktree branches: just do it. Don't ask.
- Pushing a short-lived branch to its `origin/<branch>`: fine without approval.
- Opening a PR to `master` when work is done: do it autonomously. Reviewers are on it anyway.
- Pushing **directly** to `origin/master`: **never** — PR only, no exceptions.
- Force-pushing anywhere other than your own short-lived branch: ASK. Never force-push master.
- Before ANY commit, regardless of branch: scan staged content for `.env*`, `secrets/`, tokens, private keys, AWS/GCP/Stripe/legacy auth provider/OpenAI/etc. credentials. If found, STOP and flag — do not commit the file even if it was explicitly staged. Worst outcome is leaking secrets to a public repo indexed before rotation.
- New worktrees / branches: cut off `master` for clean-slate work (master is the trunk).
