---
name: production_deploy_master_only
description: Production deploys run from master via GitHub CI unless Vincent explicitly overrides
type: feedback
status: active
last_verified: 2026-06-11
topics: [deployment, production, git, ci]
---

**Rule:** Production deploys come from GitHub CI on `master`. Vincent may explicitly direct a one-off exception.

**Why:** Genfeed.ai is an open-source app with a clean GitHub CI release flow. Production reflects the trunk and release evidence from GitHub.

**How to apply:**
- Release flow is trunk-based: short-lived branch -> PR -> `master` -> production deploy via GitHub CI. `staging`/`production` are deploy environments driven by CI/tags, NOT branches.
- Run `Deploy ECS (production)` from `master`.
- Do not deploy production from local Vercel CLI unless Vincent explicitly asks for that emergency exception.
- If production needs a hotfix, land it on `master` via `hotfix/xxx` PR, then deploy from GitHub CI.
- When touching deployment workflows, preserve or strengthen the master-only production guard.
