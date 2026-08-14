---
name: local replicate key source
description: Local API uses apps/server/api/.env.local REPLICATE_KEY because bun cwd-loads it; a stale value 401s generate
type: feedback
---

**Rule:** For local image/video generate, the live Replicate token is `apps/server/api/.env.local` `REPLICATE_KEY`. Bun `--cwd apps/server/api` loads that file into `process.env`, and ConfigService lets process env win over root `.env.local`.

**Why:** Generate 401s with "The model provider rejected the credentials" when `api/.env.local` has a revoked token even if root `.env.local` and `.env.production` are valid.

**How to apply:**

1. Probe `https://api.replicate.com/v1/account` with the API process key. Do not print the secret.
2. If it 401s, copy the working root `.env.local` value into `apps/server/api/.env.local` and restart `bun run dev:backend:min` so bun reloads env. Restarting only `main.js` keeps the stale process env.
3. Never commit `.env*`.
