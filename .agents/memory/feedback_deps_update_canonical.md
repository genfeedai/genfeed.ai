---
name: deps_update_is_canonical
description: bun run deps:update owns package and GitHub Action bumps; Dependabot is retired
type: feedback
status: active
last_verified: 2026-10-23
topics: [deps, dependabot, github-actions, ci]
---

**Rule:** Dependency bumps go through `bun run deps:update`. That command runs npm-check-updates with the published rejects, refreshes the lockfile, then bumps GitHub Action tag pins via `scripts/architecture/update-github-action-versions.ts`. Do not re-enable Dependabot ecosystems in `.github/dependabot.yml`.

**Why:** Dependabot bun PRs ignored the rejects (`typescript`, `@types/node`, `better-auth`, …) and opened a stack that fought the repo toolchain. Action pins never went through ncu at all, so workflows drifted until a human swept them.

**How to apply:**

- Use `bun run deps:update` (or `bun run deps:update:actions` for pins only).
- Weekly automation lives in `.github/workflows/deps-update.yml`.
- Digest pins, local refs, container refs, and branch pins stay untouched.
- Close leftover Dependabot PRs; do not merge TypeScript or `@types/node` major bumps from that queue.

**2026-10-23:** Sentry frontend and backend SDKs now belong to the canonical
refresh; @sentry/* is no longer rejected. The temporary hold in PR #4075
addressed @sentry/server-utils@10.72.0 missing a runtime dependency. That
version-specific history does not establish a current compatibility constraint.
Keep all other rejects and the three-hour cooldown unchanged, and verify the
installed SDK graph, security audit and affected consumers after refreshing.
