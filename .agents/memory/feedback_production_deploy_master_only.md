---
name: production_deploy_master_only
description: Production deploys are master-only via GitHub CI unless Vincent explicitly overrides
type: feedback
status: active
last_verified: 2026-06-11
topics: [deployment, production, git, ci]
---

**Rule:** Never promote or deploy `develop` or `staging` to production unless Vincent explicitly says to do that exact exception. Production deploys must come from GitHub CI on `master`.

**Why:** Vincent corrected this after a manual `workflow_dispatch` production deploy was run from `develop`. Genfeed.ai is an open-source app with a clean GitHub CI release flow; production must reflect the release branch, not an arbitrary local or selected dispatch ref.

**How to apply:**
- Default release flow remains `develop` -> `staging` -> `master` -> production deploy.
- Do not run `Deploy Production` from `develop` or `staging`.
- Do not deploy production from local Vercel CLI unless Vincent explicitly asks for that emergency exception.
- If production needs a hotfix, land or cherry-pick it onto `master`, then deploy from GitHub CI.
- When touching deployment workflows, preserve or strengthen the master-only production guard.
