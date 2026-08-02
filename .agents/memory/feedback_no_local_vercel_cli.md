---
name: no_local_vercel_cli
description: Agents must never run vercel link/pull/deploy locally — they destroy .env.local
type: feedback
status: active
last_verified: 2026-08-02
topics: [deployment, vercel, local-dev, agents]
---

**Rule:** Never run the Vercel CLI against a local checkout unless Vincent types an explicit one-off exception in the current conversation (`vercel link`, `vercel pull`, `vercel env pull`, `vercel deploy`, `vercel build`, `vercel dev`, or any `vercel` command that writes project or env state).

**Why:** Agents invent “need to link / pull env / deploy from laptop” and run `vercel link` / `vercel pull`. That overwrites or erases `.env.local` and other local Portless env, and it is useless for Genfeed production: frontends deploy only from GitHub Actions after the API release path (see `feedback_vercel_release_gate.md`). Vincent never does laptop Vercel deploys.

**How to apply:**
- Production / staging Vercel: CI only (`deploy-vercel-frontends.yml` + release chain). Use `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` / `VERCEL_TOKEN` in Actions — never local `.vercel/`.
- Local dev: Portless + committed examples + existing `.env*` only. Do not “sync env from Vercel.”
- Missing `.vercel/` or `.vercel/project.json`: do nothing. Do not `vercel link`. Do not recreate the folder.
- Never open, rewrite, truncate, or replace `.env.local` / `.env*.local` via Vercel CLI or by copying Vercel pull output over them.
- Do not “fix” broken local auth by pulling Vercel env. Debug Portless / repo env instead.
- Docs app and every other frontend: same ban. Older “confirm project.json then vercel” notes are obsolete for agent automation.
