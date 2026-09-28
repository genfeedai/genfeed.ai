---
name: hosted_saas_public_deploy
description: Hosted SaaS production deploys run from public genfeed.ai workflows, never by dispatching console.genfeed.ai
type: feedback
status: active
last_verified: 2026-08-18
topics: [deployment, production, ci, github-actions]
---

**Rule:** Ship hosted SaaS from the public `genfeedai/genfeed.ai` `Deploy hosted SaaS` / `Release` workflows. Do not dispatch `deploy-hosted-saas.yml` on `genfeedai/console.genfeed.ai`.

**Why:** Private console Actions minutes are paid. Public runners are free. GitHub Team cannot `uses:` a private reusable workflow from this public repo. The public lane must run the hosted SaaS services itself — do not clone console to steal its tree.

**How to apply:**
- Jobs, OpenTofu, and ECS scripts live in this repo (`deploy-hosted-saas.yml` /
  `_deploy-hosted-saas-core.yml` / `_deploy-hosted-saas-vercel.yml`). There is no
  `saas_lane` input anymore — the public monorepo lane is the only lane.
- Site identity lives on the `production` GitHub environment. Do not hardcode VPC, RDS, domain, or Vercel project ids in the tree.
- Do not check out `genfeedai/console.genfeed.ai` from a public deploy job.
- Do not add `uses: genfeedai/console.genfeed.ai/.github/workflows/...`.
- Fleet and LoRA stay in console. Do not copy those.
