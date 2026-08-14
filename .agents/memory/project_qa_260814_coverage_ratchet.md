---
name: qa/260814 coverage ratchet
description: Post-#2952 #2687 remainder — measure and gate app/ui/api coverage
type: project
status: active
last_verified: 2026-08-14
---

# QA / coverage ratchet (2026-08-14)

## PR

- Branch: `cursor/qa-coverage-ratchet-805a`
- Follows merged #2952 (`cursor/qa-e2e-coverage-ocean-805a`)
- Refs #2687
- Complements (does not extend) #2947

## Do not re-implement (owned by #2947)

- `scripts/architecture/check-test-collection.mjs`
- workers cron coverage split (`vitest.cron.config.ts`)
- the seven UI TODO skeleton specs
- Playwright public-route additions in `public-extra.spec.ts`

## This train

- Add `coverage.thresholds` for `apps/app` and `packages/ui` from the
  2026-08-10 weekly merged tables (~2 points below)
- Tighten `apps/server/api` floors to the same Aug 10 merged report
- Accept `coverage-final.json` in weekly Coverage asserts (Vitest often
  skips `lcov.info` on merge-reports)
- Bun-runner decision: stay on `bun test --coverage` via `test:cov`; do
  not migrate desktop/IDE to Vitest
- Leave brands/orgs API E2E quarantined — fixture/CreditsGuard reasons
  in the tier manifest are still true
- Raise `apps/server/api` coverage by replacing empty placeholder specs
  and adding util/exception tests (json-prompt, external-api-cache,
  pagination, content-plan data, text pricing, wrapError, cron timezone,
  onboarding error mapping, campaign scope, workflow status, asset
  parent, reply-bot platform, telegram args)
- Second API wave: populate builder, Cacheable/CacheInvalidate,
  service/entity/controller factories, service-module factory,
  recurrence + model-key validators, PlanLimitExceeded, viral-hooks
  entities, cron-job payload validator, and 0% DTO files
  (create-agent-strategy, skill, apify-trend). Deleted the orphan
  klingai-prompt.builder spec (source already gone).
- Do not invent new `coverage.thresholds` numbers until the next
  merged weekly Coverage report.
- Format follow-up for the first util-spec wave; mobile notification
  route helper extracted so the unit test does not import Expo hooks.

## After this PR

1. Re-measure after the next green weekly Coverage run and tighten again
   if the tables moved.
2. Un-quarantine brands/orgs only after Prisma fixture + CreditsGuard
   rewrite against Postgres.
3. Raise known-low floors (server / website functions / mobile /
   extension) with more tests, then move the numbers.
