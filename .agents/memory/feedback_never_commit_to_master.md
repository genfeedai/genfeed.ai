---
name: Never commit or push to master without explicit approval
description: Feature branches are fine to commit to freely; master is sacred and was leaked to before
type: feedback
---

**Rule:** Never commit or push to `master` without explicit user approval. On feature branches, worktrees, and any non-master branch, committing is fine and does NOT need per-commit approval — implement the plan and commit as you go.

**Why:** There was a prior incident where `.env.production` secrets were pushed to `master` on this open-source repo. That's why CLAUDE.md's "never commit/push without explicit user approval" rule exists — but the rule's intent is specifically about the branches that matter (master, and by extension staging via PR flow), NOT about the per-commit dance on a throwaway feature branch or worktree. The git workflow in CLAUDE.md explicitly documents: `develop → staging → master` via PR; feature work lives on `feat/xxx` off `develop`. Per-commit approval on feature branches is friction with zero safety value; the real safety gate is at PR-to-staging and PR-to-master.

**How to apply:**
- Committing on feature branches / worktrees / any branch other than master: just do it. Don't ask.
- Pushing feature branches to `origin/feat/xxx`: fine without approval (it's just a remote feature branch).
- Pushing to `origin/develop`: ASK first. That's a shared mainline.
- Pushing to `origin/staging` or `origin/master`: **always ask**, and also go through PR, never direct push.
- Force-pushing anywhere other than your own feature branch: ASK.
- Before ANY commit, regardless of branch: scan staged content for `.env*`, `secrets/`, tokens, private keys, AWS/GCP/Stripe/Clerk/OpenAI/etc. credentials. If found, STOP and flag — do not commit the file even if it was explicitly staged. The worst outcome is leaking secrets to a public repo that's indexed before rotation.
- When creating worktrees, prefer `git worktree add` off `master` for clean-slate work that isn't tied to current `develop` drift.
