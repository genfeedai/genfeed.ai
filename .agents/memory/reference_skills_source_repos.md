---
name: skills_source_repos
description: Source-of-truth repos for free product skills vs paid Skills Pro
type: reference
status: active
last_verified: 2026-06-18
topics: [skills, skills-pro, cdn, repositories]
---

Genfeed.ai uses separate source repositories for free and paid skills.

- Free Genfeed product skills come from `genfeedai/skills` and are mirrored into this repo's root `skills/` directory for app usage.
- Paid Skills Pro content comes from the private `genfeedai/skills-pro` repo, not this repo's root `skills/` directory.
- `genfeedai/skills-pro` owns the paid `skills/` source, generated `artifacts/skills/v1/**/skill.zip` files, and `registry/skills-pro.json`.
- Runtime paid access in `genfeed.ai` should use the CDN/S3 registry plus receipt-gated presigned downloads, with `genfeedai/skills-pro` as the source of truth for the published artifacts.

**How to apply:** When debugging or publishing Skills Pro, inspect `genfeedai/skills-pro`. Do not compare the paid CDN registry against this repo's root `skills/` directory; those are the free in-app skills.
