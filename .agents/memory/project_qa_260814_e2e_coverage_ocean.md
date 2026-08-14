---
name: qa/260814 e2e coverage ocean
description: Complementary QA/E2E/coverage train that does not collide with PR #2947
type: project
status: active
last_verified: 2026-08-14
---

# QA / E2E / coverage ocean (2026-08-14)

## PR

- Branch: `cursor/qa-e2e-coverage-ocean-805a`
- Complements (does not extend) #2947 (`cursor/qa-coverage-hardening-de5a`)
- Refs #2687 #2444

## Do not re-implement (owned by #2947)

- `scripts/architecture/check-test-collection.mjs`
- workers cron coverage split (`vitest.cron.config.ts`)
- pages research URL `.spec.ts` → `.test.ts` merge
- the seven UI TODO skeleton specs
- Playwright public-route additions in `public-extra.spec.ts`
  (`/forgot-password`, `/reset-password`, `/agent-auth/claim`,
  `/oauth/consent`, `/connect`)

## This train

- Dedicated Playwright navigations for remaining uncovered product routes
  (admin administration, desktop local, legacy editors, offline)
- Ratchet dedicated E2E route-coverage floor 80 → 90
- Un-quarantine API E2E: delete dead `health.e2e-spec.ts`; repair
  `publish-flow` DTO + `tasks` harness/seed
- Raise unit coverage on known-low / unmeasured surfaces
  (server exceptions + Meta Ads ID coercion, website catalog getters,
  mobile HTTP/async hooks, browser-extension platform config,
  app cloud-session + BYOK headers)
- Docs SEO page-count derived from the MDX tree (#2444)

## After merge

1. Re-measure `apps/app`, `packages/ui`, `apps/server/api` via the existing
   sharded coverage workflow and add `coverage.thresholds` ~2 points below
   the merged number (#2687 remainder).
2. Un-quarantine `brands.e2e-spec.ts` / `organizations.e2e-spec.ts` once
   `forBrands()` / `forOrganizations()` have been exercised against Postgres.
3. Bun-runner surfaces (`apps/desktop/app`, `apps/extensions/ide/app`) still
   need a coverage gate decision.
