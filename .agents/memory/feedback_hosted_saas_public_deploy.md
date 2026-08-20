---
name: hosted_saas_public_deploy
description: Hosted SaaS production deploys run entirely from public genfeed.ai workflows
type: feedback
status: active
last_verified: 2026-08-18
topics: [deployment, production, ci, github-actions]
---

**Rule:** Ship hosted SaaS from the public `genfeedai/genfeed.ai` `Deploy hosted SaaS` / `Release` workflows. Do not dispatch or reuse private operational repositories.

**Why:** Public runners are free, and GitHub Team cannot `uses:` a private reusable workflow from this public repo. The public lane must own the hosted SaaS deployment itself.

**How to apply:**
- Default `saas_lane=monorepo`. Jobs, OpenTofu, and ECS scripts live in this repo.
- Site identity lives on the `production` GitHub environment. Do not hardcode VPC, RDS, domain, or Vercel project ids in the tree.
- Do not check out private operational repositories from a public deploy job.
- Do not add private reusable-workflow dependencies.
- Managed inference operations stay outside this repository.
- `saas_lane=operations` stays an explicit private-log fallback only.
