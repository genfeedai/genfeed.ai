---
name: deps_update_is_canonical
description: bun run deps:update owns package and GitHub Action bumps; Dependabot is retired
type: feedback
status: active
last_verified: 2026-08-18
topics: [deps, dependabot, github-actions, ci]
---

**Rule:** Dependency bumps go through `bun run deps:update`. That command runs npm-check-updates with the published rejects, refreshes the lockfile, then bumps GitHub Action tag pins via `scripts/architecture/update-github-action-versions.ts`. Do not re-enable Dependabot ecosystems in `.github/dependabot.yml`.

**Why:** Dependabot bun PRs ignored the rejects (`typescript`, `@types/node`, `better-auth`, …) and opened a stack that fought the repo toolchain. Action pins never went through ncu at all, so workflows drifted until a human swept them.

**How to apply:**

- Use `bun run deps:update` (or `bun run deps:update:actions` for pins only).
- Weekly automation lives in `.github/workflows/deps-update.yml`.
- Digest pins, local refs, container refs, and branch pins stay untouched.
- Close leftover Dependabot PRs; do not merge TypeScript or `@types/node` major bumps from that queue.
