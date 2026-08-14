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
- Second wave (still on this branch): agent util specs, query-cache /
  pick-defined-fields, integration retry-policy, website FAQ catalog,
  constants inventory, app desktop/analytics/colors, mobile network +
  offline queue + ideas/approvals/analytics, extension logger
- Third wave: helpers `sanitizeHtml` allowlist, embedding/API-key-scope
  constant contracts

## After merge

**New branch / PR.** Do not keep piling onto `cursor/qa-e2e-coverage-ocean-805a`
after #2952 is rebased green. Cut the next #2687 train from updated `master`
(`cursor/qa-coverage-ratchet-<suffix>`) so this PR stays reviewable.

1. Re-measure `apps/app`, `packages/ui`, `apps/server/api` via the existing
   sharded coverage workflow and add `coverage.thresholds` ~2 points below
   the merged number (#2687 remainder).
2. Un-quarantine `brands.e2e-spec.ts` / `organizations.e2e-spec.ts` once
   `forBrands()` / `forOrganizations()` have been exercised against Postgres.
3. Bun-runner surfaces (`apps/desktop/app`, `apps/extensions/ide/app`) still
   need a coverage gate decision.

## Merge order (this closeout)

1. #2950 (`codex/fix-master-ci-2948`) — required checks green, then squash.
2. Rebase #2952 onto that `master` tip. Do not open a third CI-stabilize PR.
3. Merge #2952 when green.
4. Rebase or close #2947 after that; leftover public-route / UI skeleton work
   stays on #2947 unless it is abandoned.
5. Next remainder → new branch from updated `master`.
