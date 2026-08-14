---
name: local saas staging cdn
description: Local SaaS development publishes media through staging-cdn.genfeed.ai, never the files host or /local/ disk paths
type: feedback
---

**Rule:** Localhost with `GENFEED_CLOUD=true` is SaaS development. Public media URLs are `https://staging-cdn.genfeed.ai/{key}`. `files.genfeed.localhost` is the files API origin only. Do not persist `/local/...` paths or glue the files host onto ingredient `cdnUrl`s.

**Why:** `*.genfeed.localhost` is not a hosted SaaS hostname. If `GENFEED_CLOUD` is missing from the files/api process env, `createStorageProvider()` picks the local disk driver and writes `/local/ingredients/...`. The files host then becomes the public URL even though the operator is on their SaaS account.

**How to apply:**

1. Keep `GENFEED_CLOUD=true` and `GENFEEDAI_CDN_URL=https://staging-cdn.genfeed.ai` in root `.env.local`.
2. Run `bun run env:sync local` so api/files receive both keys. Never hand-edit generated env files.
3. Restart `dev:backend:min` after sync so bun reloads env.
4. Do not treat `files.genfeed.localhost` as a CDN. Do not rewrite existing local-disk rows onto the staging bucket unless asked — those objects may not exist in S3.
