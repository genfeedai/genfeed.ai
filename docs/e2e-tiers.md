# E2E tiers

Canonical contract for API and Playwright end-to-end suites. Use these
names everywhere — scripts, workflows, and reports.

| Tier | Meaning | Playwright | API |
| --- | --- | --- | --- |
| `core` | Release/deploy gate. Small mocked (Playwright) or release-critical (API) subset. | `test:e2e:core` / `test:e2e:sharded` → `playwright/configs/playwright.config.ts` (`app-core`). CI job `e2e-frontend` in `e2e.yml`. | `apps/server/api` `test:e2e:core` via `scripts/api-e2e-tiers.ts`. CI job `e2e-api`. |
| `authed` | Hermetic real Better Auth smoke. Gates the Playwright nightly; `continue-on-error` on deploy. | `test:e2e:authed` → `playwright/configs/playwright.config.ts` (`app-authed`). CI job `e2e-frontend-authed`. | No API authed tier. |
| `full` | Every discoverable spec except explicit quarantines. Reporting-only for Playwright. | `test:e2e:full` → `scripts/playwright-e2e-tiers.mjs` using `playwright/configs/playwright.config.ts` (`app-core`). Nightly workflow `playwright-full-nightly.yml`. | `apps/server/api` `test:e2e:full`. CI job `e2e-api-full` (manual/nightly only). |
| `isolated-publish` | Disposable Postgres + Redis publish journey. Fake publishers only. Not a PR required check and never attached to mocked Playwright core or the production `workflow_call` path. | None. Playwright stays off this lane. | `apps/server/api` `test:e2e:isolated-publish`. CI job `e2e-isolated-publish` in `e2e.yml` (nightly schedule + `workflow_dispatch` only). Tracking: #3836. |

## Production gates

`full-suite.yml` calls `e2e.yml`, which gates production on Playwright `core`
plus API `core`. Playwright `authed` stays non-gating on that deploy path.
Playwright `full` must never be `uses`/`needs` of `full-suite.yml` or
`daily-production-deploy.yml`.

## Playwright full-tier quarantines

Machine-readable list: `scripts/playwright-e2e-tiers.manifest.mjs`.

Each row records:

- `file` — repo-relative spec path
- `reason` — why it is not executed in the mocked full tier
- `owner` or `trackingIssue` — who owns the follow-up
- `reviewBy` — ISO date (`YYYY-MM-DD`) when the quarantine must be revisited

Expired quarantines fail CI. API exclusions live in
`apps/server/api/scripts/api-e2e-tiers.manifest.ts` and use the same `core` /
`full` names.
