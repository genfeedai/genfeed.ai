---
name: vercel_release_gate
description: SaaS Vercel frontends must deploy only through the API-first production release workflow
type: feedback
status: active
last_verified: 2026-06-24
topics: [deployment, production, vercel, ci]
---

**Rule:** Keep Vercel Git auto-deploy disabled for SaaS frontend projects. Production frontend deploys for `app.genfeed.ai`, `genfeed.ai`, and `docs.genfeed.ai` must be triggered by GitHub CI after the production API release job succeeds. There is no standalone `admin.genfeed.ai` Vercel project in the open-source monorepo; instance-admin UI should live under `apps/app` when it is exposed.

**Why:** Merging PR #795 to `master` triggered Vercel Git integration and deployed `app.genfeed.ai` before the API release path ran. The desired workflow mirrors Gateway Ventures' Vitae flow: merge to trunk is not the same as cutting a SaaS release; frontends deploy after API/migrations/smoke checks, not before.

**How to apply:**
- Keep `git.deploymentEnabled` disabled for `master`, `staging`, and wildcard branches in each frontend `vercel.json`.
- Deploy production frontends only from the reusable Vercel frontend workflow called after the production API/ECS deployment succeeds.
- Do not add a standalone admin frontend to the deployment matrix unless there is a real monorepo build target and a deliberate reason to split it from `apps/app`.
- Do not run local Vercel production deploys unless Vincent explicitly asks for an emergency exception.
- When adding another Vercel app, wire it into the CI release chain before allowing any production domain to point at it.
