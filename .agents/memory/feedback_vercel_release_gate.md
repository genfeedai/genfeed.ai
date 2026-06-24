---
name: vercel_release_gate
description: SaaS Vercel frontends must deploy only through the API-first production release workflow
type: feedback
status: active
last_verified: 2026-06-24
topics: [deployment, production, vercel, ci]
---

**Rule:** Keep Vercel Git auto-deploy disabled for SaaS frontend projects. Production frontend deploys for `app.genfeed.ai`, `genfeed.ai`, `docs.genfeed.ai`, and any open-source `admin.genfeed.ai` target must be triggered by GitHub CI after the production API release job succeeds. `admin.genfeed.ai` is the open-source Genfeed admin surface for people managing their own Genfeed instance. Keep the monorepo `apps/admin/vercel.json` kill-switch while the `admin.genfeed.ai` Vercel project still points at the removed `apps/admin` root.

**Why:** Merging PR #795 to `master` triggered Vercel Git integration and deployed `app.genfeed.ai` before the API release path ran. The desired workflow mirrors Gateway Ventures' Vitae flow: merge to trunk is not the same as cutting a SaaS release; frontends deploy after API/migrations/smoke checks, not before.

**How to apply:**
- Keep `git.deploymentEnabled` disabled for `master`, `staging`, and wildcard branches in each frontend `vercel.json`.
- Deploy production frontends only from the reusable Vercel frontend workflow called after the production API/ECS deployment succeeds.
- Do not add `admin.genfeed.ai` to the frontend deployment matrix until it has a real monorepo build target again.
- Do not run local Vercel production deploys unless Vincent explicitly asks for an emergency exception.
- When adding another Vercel app, wire it into the CI release chain before allowing any production domain to point at it.
