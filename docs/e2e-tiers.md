# E2E tiers

Canonical contract for API and Playwright end-to-end suites. Use these
names everywhere — scripts, workflows, and reports.

| Tier | Meaning | Playwright | API |
| --- | --- | --- | --- |
| `core` | Release/deploy gate. Small mocked (Playwright) or release-critical (API) subset. | `test:e2e:core` (`scripts/playwright-e2e-tiers.mjs --tier=core`) / `test:e2e:sharded` → `playwright/configs/playwright.config.ts` (`app-core`). CI job `e2e-frontend` in `e2e.yml`. | `apps/server/api` `test:e2e:core` via `scripts/api-e2e-tiers.ts`. CI job `e2e-api`. |
| `authed` | Hermetic real Better Auth smoke. Gates the Playwright nightly; `continue-on-error` on deploy. | `test:e2e:authed` → `playwright/configs/playwright.config.ts` (`app-authed`). CI job `e2e-frontend-authed`. | No API authed tier. |
| `full` | Every discoverable mocked-app spec except explicit quarantines; other execution lanes are listed separately. Non-blocking for releases; nightly failures remain actionable. | `test:e2e:full` → `scripts/playwright-e2e-tiers.mjs` using `playwright/configs/playwright.config.ts` (`app-core`). Nightly workflow `playwright-full-nightly.yml`. | `apps/server/api` `test:e2e:full`. CI job `e2e-api-full` (manual/nightly only). |
| `isolated-publish` | Disposable Postgres + Redis publish journey. Fake publishers only. Not a PR required check and never attached to mocked Playwright core or the production `workflow_call` path. | None. Playwright stays off this lane. | `apps/server/api` `test:e2e:isolated-publish`. CI job `e2e-isolated-publish` in `e2e.yml` (nightly schedule + `workflow_dispatch` only). Tracking: #3836. |

## Production gates

`full-suite.yml` calls `e2e.yml`, which gates production on Playwright `core`
plus API `core`. Playwright `authed` stays non-gating on that deploy path.
Playwright `full` must never be `uses`/`needs` of `full-suite.yml` or
`release.yml`.

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


## Selection and evidence

The `PLAYWRIGHT_E2E_CORE_PATHS` list in the tier manifest owns core selection
for both the local tier CLI and the CI shard runner. Core includes smoke, core,
onboarding, the shell page-context contract, and clips. Changed and failed-only
commands apply their Playwright filters to this same selector set. Missing files
or emptied selector directories fail before Playwright starts. The changed
command compares against `origin/master` by default.

`PLAYWRIGHT_E2E_LANE_EXCLUSIONS` records specs assigned to real-auth, cross-app,
and release-install execution. These are not broken-test quarantines, and their
presence does not prove that the other lane ran. Visual specs remain quarantined
until a stable baseline job and update process exist. Quarantines retain owners,
tracking issues, and expiry checks; they must not be moved into another-lane
inventory merely to hide drift.

The full-tier JSON summary separates file inventory from executed test cases.
Projects count separately; retries do not inflate execution totals. Skipped,
flaky, first-attempt failure, and global report-error counts expose regression
signal without claiming skipped tests passed. Missing or empty reports and
global teardown errors cannot produce a passed summary. A failed summary makes
the standalone nightly job fail and triggers its existing failure reporter;
it does not add the full tier as a production release dependency. Explicit report inputs
exclude default local reports so stale artifacts cannot inflate the result.

`test:e2e:routes` is a static source-reference inventory, not a coverage gate.
It counts exact canonical route references, including references in excluded
specs and page objects; parents and descendants do not receive implicit credit.
It cannot establish that navigation occurred or an assertion passed. No generated
sweep is assigned 100% coverage. The existing executed core browser/API gates
own release pass/fail. Promotion of authenticated/full journeys remains subject
to their prerequisite reliability work (#439 / #1849).
