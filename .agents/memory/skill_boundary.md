---
name: skill_boundary
description: .agents/skills are for building Genfeed; root skills/ are product content skills
type: feedback
status: active
last_verified: 2026-06-11
topics: [skills, repo-structure, agents]
---

**Rule:** Keep `.agents/skills/` scoped to skills that help agents build, test, review, ship, and maintain the `genfeed.ai` repository itself. Keep product-facing content-generation skills under root `skills/`.

**Why:** `.agents/skills/` is agent tooling for repository development. Root `skills/` is part of the Genfeed product surface and should contain content, publishing, strategy, prompting, warmup, and workflow skills used by Genfeed.ai. Mixing the two makes agents load irrelevant business/content skills while coding and risks shipping internal repo-build guidance as product content.

**How to apply:**
- Add framework, testing, architecture, debugging, validation, security, and release skills to `.agents/skills/`.
- Add content creator, channel strategy, prompt generation, warmup, SEO, ad, newsletter, and workflow authoring skills to root `skills/`.
- Prefer root `skills/` content from `genfeedai/skills` when syncing product content skills.
- Do not bulk-import generic personal, outbound, CRM, hiring, fundraising, or business-ops skills into `.agents/skills/`.
