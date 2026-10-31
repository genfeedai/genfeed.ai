# E2E tiers

Canonical contract for API and Playwright end-to-end suites. Use these
names everywhere — scripts, workflows, and reports.

| Tier | Meaning | Playwright | API |
| --- | --- | --- | --- |
| `core` | Release/deploy gate. Small mocked (Playwright) or release-critical (API) subset. | `test:e2e:core` (`scripts/playwright-e2e-tiers.mjs --tier=core`) / `test:e2e:sharded` → `playwright/configs/playwright.config.ts` (`app-core`). CI job `e2e-frontend` in `e2e.yml`. | `apps/server/api` `test:e2e:core` via `scripts/api-e2e-tiers.ts`. CI job `e2e-api`. |
| `authed` | Hermetic real Better Auth smoke. Gates the Playwright nightly; `continue-on-error` on deploy. | `test:e2e:authed` → `playwright/configs/playwright.config.ts` (`app-authed`). CI job `e2e-frontend-authed`. | No API authed tier. |
| `full` | Every discoverable mocked-app spec except explicit quarantines; other execution lanes are listed separately. Not a `needs` of releases; a green exact-SHA run is required as release evidence (see Production gates). Nightly failures remain actionable. | `test:e2e:full` → `scripts/playwright-e2e-tiers.mjs` using `playwright/configs/playwright.config.ts` (`app-core`). Nightly workflow `playwright-full-nightly.yml`. | `apps/server/api` `test:e2e:full`. CI job `e2e-api-full` (manual/nightly only). |
| `isolated-publish` | Disposable Postgres + Redis publish journey. Fake publishers only. Not a PR required check and never attached to mocked Playwright core or the production `workflow_call` path. | None. Playwright stays off this lane. | `apps/server/api` `test:e2e:isolated-publish`. CI job `e2e-isolated-publish` in `e2e.yml` (nightly schedule + `workflow_dispatch` only). Tracking: #3836. |

## Production gates

`full-suite.yml` calls `e2e.yml`, which gates production on Playwright `core`
plus API `core`. Playwright `authed` stays non-gating on that deploy path.
Playwright `full` must never be `uses`/`needs` of `full-suite.yml` or
`release.yml`.

`release.yml` additionally requires a green run of Playwright Full
(`playwright-full-nightly.yml`) and Learning Runtime (`learning-runtime.yml`)
for the release SHA, checked by `scripts/ci/browser-suite-evidence.mjs` in
`validate-release`. This reads evidence only: it neither starts nor waits for
those suites.

- A verdict on the exact release SHA decides. A newer green re-run clears an
  earlier red for the same SHA; a cancelled run is never a verdict.
- An exact-SHA run still in flight blocks; re-run Release once it finishes.
- With neither, the newest verdict on the nearest master commit before the
  release SHA from the last 48 hours decides. A green run there counts only if
  every file changed since is neutral for that suite: files the suite never
  builds or runs, such as `apps/server/` for Playwright Full or `apps/web/` for
  Learning Runtime, docs, and other workflow files. The neutral lists live in
  `REQUIRED_BROWSER_SUITES`. Any other change needs a fresh dispatch on master,
  and the error names the files.

So a nightly run carries over to a release whose later merges are all outside
that suite, and is re-dispatched otherwise.

## Pull request smoke

`playwright-pr-smoke.yml` runs Playwright `core` on one runner (no sharding) for
pull requests that affect `@genfeedai/web` through the workspace graph. It is
advisory (`continue-on-error`, not a required check) and exists so a UI change
that breaks a browser spec is red on the PR instead of on master. It never
runs the `full` tier and is not a dependency of `full-suite.yml` or
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
onboarding, the shell page-context contract and context sidebar, clips, and
Studio Generate video actions and drafts. Changed and failed-only
commands apply their Playwright filters to this same selector set. Missing files
or emptied selector directories fail before Playwright starts. The changed
command compares against `origin/master` by default.

`PLAYWRIGHT_E2E_LANE_EXCLUSIONS` records specs assigned to real-auth, cross-app,
release-install, and Cloud execution. The `cloud` lane (`playwright/e2e/tests/cloud/`)
needs the Cloud build (test-only `NEXT_PUBLIC_GENFEED_E2E_DEPLOYMENT=cloud`, set by the
`genfeed-cloud` input of `setup-playwright-app`; production Cloud is decided by a `*.genfeed.ai` host and ignores it) because the Community-built full tier gates credit reads
behind `hasOrganizationBillingHint()`; the `e2e-cloud-billing` job of
`playwright-full-nightly.yml` runs it and counts toward the nightly verdict. These are not broken-test quarantines, and their
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
