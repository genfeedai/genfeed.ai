---
name: local env source of truth
description: Edit only root .env.local; generated app/service env files are mirrors. bun run env:sync local after changes
type: feedback
---

**Rule:** Local secrets live in the repo-root `.env.local` only. `apps/server/api/.env.local` and the other app files are generated mirrors. Edit root, then `bun run env:sync local`. Never hand-edit a generated file.

**Why:** Bun starts the API from `apps/server/api`, auto-loads that generated file into `process.env`, and a stale copy 401s Replicate/OpenRouter even when root is valid.

**How to apply:**

1. Put provider keys in root `.env.local` only.
2. Run `bun run env:sync local` so generated files match.
3. Restart `bun run dev:backend:min` so bun reloads env. ConfigService also ignores process.env values that merely echo the generated file, so a leftover stale copy cannot win.
4. Never commit `.env*`.
