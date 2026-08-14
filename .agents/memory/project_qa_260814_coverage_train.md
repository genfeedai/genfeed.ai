---
name: qa/260814 coverage train
description: Deterministic QA train for uncollected tests, cron coverage, and skeleton UI specs
type: project
status: active
last_verified: 2026-08-14
---

# QA train — 2026-08-14

## PR

- Ready: https://github.com/genfeedai/genfeed.ai/pull/2947
- Branch: `cursor/qa-coverage-hardening-de5a`
- Refs #2687 (measure/gate remaining coverage surfaces)
- Does not claim #1849 (changed-code ratchet already in CI observation), #1828 / PR #2934 (nightly Playwright full), #1593 / #1594 coverage PRs, or Fallow PRs

## In this train

- Test-collection script exists as `bun run check:test-collection` for local use. **Not** wired as a CI `guards` step — Vincent rejected that; #2946 owns YAML-ratchet cleanup. #2961 follow-up stays on this PR: public-route assertions, Vitest default includes, and collectors registered only from executable runner commands. Do **not** re-pin `check-test-collection` in `pr-validation-workflows.test.mjs`.
- Folded the uncollected `packages/pages` research URL `.spec.ts` into the collected `.test.ts` (pages include is `*.test.ts(x)` only)
- Workers cron sources no longer dilute default coverage; `vitest.cron.config.ts` now has its own coverage gate (`test:cron:cov`)
- Replaced seven `TODO: Add interaction tests` skeletons in `@genfeedai/ui` with behavior tests

## Out of scope (already claimed)

- #1849 changed-code coverage observation
- #1828 nightly full Playwright
- #1593 auth session coverage
- #1594 library lifecycle coverage
- Fallow complexity #2081 / #2133

## Verify

Ran 2026-08-14 in this environment (Node 22; Bun not installed):

- `node --test scripts/architecture/check-test-collection.test.mjs` — 9/9 pass
- `node --test scripts/ci/pr-validation-workflows.test.mjs` — no collection-guard pin (removed)
- `node scripts/architecture/check-test-collection.mjs` — `Test collection guard passed.`
- `node scripts/e2e-route-coverage.mjs` — dedicated 95.8% / effective 100% (threshold 80%)

Left to PR CI (needs Bun + workspace install):

```bash
bun run test --filter=@genfeedai/ui
bun run test --filter=@genfeedai/pages
bun run --cwd apps/server/workers test
```
