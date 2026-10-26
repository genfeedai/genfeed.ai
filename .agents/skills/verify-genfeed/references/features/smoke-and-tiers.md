# Smoke and tiers

## What exists
Playwright lanes defined in `docs/e2e-tiers.md` and `playwright/configs/playwright.config.ts`:
`core` (mocked release gate), `authed` (real Better Auth; nightly-gating, continue-on-error
on the deploy path), `full` (reporting-only nightly), `isolated-publish` (API only).
Quarantines live in `scripts/playwright-e2e-tiers.manifest.mjs` with owner, tracking issue
and an expiring `reviewBy`; expired ones fail CI. `bun run test:e2e:routes` is a static
route-reference inventory, not coverage.

## How a user reaches it
CI workflows: `playwright-pr-smoke.yml` (advisory), `playwright-full-nightly.yml`
(reporting-only). Locally: the lane commands in SKILL.md.

## How to drive it
Specs under `playwright/e2e/tests/smoke/`: `safe`, `all-app-pages`,
`all-app-pages.authed`, `protected-hydration`, `studio-motion.authed`. Core also includes
`core/content-loop.spec.ts`. Config: `workers: 1`, test timeout 120 s, expect 60 s,
viewport 1280×720, locale `en-US`, TZ `America/New_York`.

## What usually breaks
- No full-suite PR gate: E2E-only regressions can land until the nightly runs. A green
  PR does not prove the full lane.
- `workers: 1` with `fullyParallel: true` masks races that appear once workers increase.
- The Playwright browser cache has no restore-key, so cold CI runs are slow.
- Release evidence needs an exact-SHA green full run, checked by
  `scripts/ci/browser-suite-evidence.mjs`; a near-SHA run does not count.
- Turbopack cache growth (~15 GB) causes ENOSPC; `scripts/dev/cleanup-playwright-cache.ts` and `cleanup.sh`
  remove `apps/app/.next/dev/cache`.
