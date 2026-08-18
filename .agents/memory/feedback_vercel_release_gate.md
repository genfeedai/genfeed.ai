---
name: vercel_release_gate
description: SaaS Vercel frontends must deploy only through the API-first production release workflow
type: feedback
status: active
last_verified: 2026-08-18
topics: [deployment, production, vercel, ci]
---

**Rule:** Keep Vercel Git auto-deploy disabled for SaaS frontend projects. Production frontend deploys for `app.genfeed.ai`, `genfeed.ai`, `docs.genfeed.ai`, and `marketplace.genfeed.ai` run through the public `Deploy hosted SaaS` / `Release` workflows after the production API release succeeds. Deploy jobs and OpenTofu run in this public repository. Each repository is deployed from an exact SHA verified against its trunk. There is no standalone `admin.genfeed.ai` Vercel project in the open-source monorepo; instance-admin UI should live under `apps/app` when it is exposed.

**Why:** Merging PR #795 to `master` triggered Vercel Git integration and deployed `app.genfeed.ai` before the API release path ran. The desired workflow mirrors Gateway Ventures' Vitae flow: merge to trunk is not the same as cutting a SaaS release; frontends deploy after API/migrations/smoke checks, not before.

**How to apply:**
- Keep `git.deploymentEnabled` disabled for `master`, `staging`, and wildcard branches in each frontend `vercel.json`.
- Deploy production frontends only from the public `Release` / `Deploy hosted SaaS` lane after the production API deployment succeeds. Do not dispatch console to ship frontends.
- Do not add a standalone admin frontend to the deployment matrix unless there is a real monorepo build target and a deliberate reason to split it from `apps/app`.
- Local Vercel CLI is forbidden for agent workspaces (host global rule). CI owns production frontend deploys.
- When adding another Vercel app, wire it into the CI release chain before allowing any production domain to point at it.
