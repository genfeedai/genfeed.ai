# CI/CD enforcement

This document maps Genfeed's delivery rules to the mechanism that enforces
them. It distinguishes repository code, which changes through pull requests,
from GitHub settings, which a repository administrator must maintain.

Last audited: 2026-09-01 against `master`, repository rulesets, Actions policy,
deployment environments, recent workflow runs, and the current workflow test
suite.

## Optimization target

Pull requests should receive the fastest trustworthy result for the exact head
SHA without reducing test reachability. The repository therefore keeps cheap
deterministic checks unconditional, plans affected tests before allocating
runners, uses Vitest's dependency graph and Turbo's affected graph instead of a
hand-maintained path approximation, and cancels only superseded pull-request
runs. Release, deployment, full E2E, and broad coverage remain separate because
they have different permissions, secrets, and runtime budgets.

## Studio remediation contract

Studio verification narrows repair work; it does not mint reusable GitHub
check results. When CI fails, reproduce and rerun only the broken jobs, test
files, packages, or application surfaces on Studio, plus any focused regression
added by the fix. Do not rerun the entire repository locally just because one CI
surface failed.

After a code fix is pushed, GitHub sees a new commit SHA and recomputes the
affected graph for that SHA. The pull-request workflow runs the cheap
static/security gates plus the changed surfaces and their dependents. Draft
pull requests run no CI; it starts when the PR is marked ready for review.
GitHub's **Re-run failed jobs** is reserved for a transient failure on the same
SHA; it cannot carry green jobs forward to a new commit.

The post-merge contract is intentionally broader: `full-suite.yml` runs the
complete heavy tier on demand (Actions, Run workflow) and from the Release
workflow, never on a `master` push, and never cancels a running suite. The
`master-ci-failure` tracker is dormant because it keys off the `push` event;
a red manual or release run is reported by the Master SHA Verdict job. The
stable Release workflow waits for an exact-SHA run and reuses its green result
instead of starting a duplicate Full Suite. A hard-red exact-SHA run blocks release until its failed surfaces are
fixed on a new SHA. Missing or infrastructure-cancelled evidence falls back to
the reusable Full Suite so verification is never skipped.

## CI throughput audit — 2026-09-27

Update 2026-10-03: the Full Suite no longer runs on master pushes at all (on
demand and at release only), because it still competed with PR CI for runners.
The paragraph below records the audit as found.

Over ~19 hours the repository used 205 runner-hours across 604 runs. Pull
request CI took a median 30 minutes (p90 121) wall clock for ~15 minutes of
critical-path compute; the rest was runner queueing (job wait p90 27 minutes,
peak queue depth 154). The Full Suite ran on every master push with
cancel-in-progress, but at ~60 minutes against a merge every ~23 minutes, 51 of
60 runs were cancelled, so master saw ~5 heavy verdicts a day. 57 of those 60
minutes were the spec-typecheck ratchet walking five ~10-minute workspaces in
series. The merge queue was bypassed for most merges.

The changes:

1. The Full Suite never cancels a running suite, so every run reaches a
   verdict; merges that land meanwhile collapse into one pending run. (An
   hourly cron was tried first and dropped: scheduled workflows here start
   hours late.)
2. Spec typecheck runs as a matrix: each ~10-minute workspace gets its own leg
   (`scripts/ci/spec-typecheck-matrix.mjs`).
3. `ci.yml` went from 20 job definitions to 9: trust, test plan, and spec scope
   share the Plan job; gitleaks lives in Static Checks; OpenAPI drift lives in
   Build; packages, server-service, and web/mobile tests share one matrix job
   (a leg per group); full and changed app/API shards share one matrix job
   each.
4. Draft pull requests run no CI.
5. The merge queue and its plumbing (merge-group triggers, the external-status
   republisher, and the zombie-run janitor) are gone.
6. The observation-only changed-code coverage was removed after two months
   without promotion; full-repository coverage stays in the weekly Coverage
   workflow.
7. The shared Bun setup no longer restores a ~1 GB lockfile-keyed `.turbo`
   snapshot on every job; the Turbo remote cache serves task outputs.
8. Pull requests diff against the merge commit's first parent, not the event
   payload's `pull_request.base.sha`, which can be stale and escalated
   ordinary PRs to the full tier.

## Workflow inventory audit — 2026-09-01

The repository contains 32 workflow files: 29 have a direct event or manual
entry point, 12 are reusable, and three of those are reusable-only cores with
checked-in callers. No checked-in workflow is orphaned. Manual release,
extension, mobile, desktop, and recovery workflows remain intentionally
infrequent; no recent run is not evidence that those entry points are dead.

GitHub still registered three deleted branch-only diagnostics: `Tmp Spec
Baseline`, `Copy Turbo token to console (one-shot)`, and `ZZ Throwaway Test
Inventory`. They were disabled after confirming their files were absent from
`master` and their only runs came from temporary branches. GitHub-managed
Dependency Graph, Dependabot, and CodeQL registrations are platform-owned and
were kept separate from repository workflow cleanup.

The release audit found one unsafe reusable-workflow collision. Both the
master-push and Release callers entered `build-verify.yml` under
`build-verify-master`; the Release run cancelled the still-green master build
writer and made the otherwise-green master Full Suite conclude `cancelled`.
Server and self-hosted build verification now serialize shared-cache writers
without cancellation. The Release evidence step also discovers and waits for an
in-flight exact-SHA master Full Suite, eliminating the duplicate heavy matrix.

The alternatives considered for this audit were:

1. Add another path-filter workflow or more named guard steps. This would
   duplicate the existing test planner and executable-contract suite while
   increasing workflow surface area.
2. Strengthen the existing enforcement points. This preserves the adaptive
   topology and closes a supply-chain gap without adding runner jobs. This is
   the selected approach.

## Rule-to-enforcement matrix

| Rule | Mechanical enforcement | Scope and failure behavior | Owner |
| --- | --- | --- | --- |
| `master` is PR-only | GitHub ruleset `Passing CI on master`; required `Tests Gate`; on-demand `full-suite.yml` (dispatch and release) | Every PR must pass its own aggregate gate; integration drift between concurrently merged PRs surfaces at the next manual or release Full Suite | GitHub setting + repository workflows |
| Superseded PR work is disposable; landed and release work is not | Top-level workflow concurrency plus `scripts/ci/ci-concurrency.test.ts` and `scripts/ci/pr-validation-workflows.test.mjs` | PR runs cancel within one PR/ref; the master Full Suite, release, deploy, and shared-cache writers queue or complete | Repository code |
| Changed scope must preserve dependency reachability | `scripts/ci/pr-test-plan.mjs`, Vitest `--changed`, Turbo `--affected --dry=json`, adaptive 1/2/4 shard matrices, fail-closed `Tests Gate` | Root toolchain and planner changes escalate to the full matrix; invalid or missing plans fail | Repository code |
| Lint, format, type, build, tests, schema, and boundaries are deterministic | Frozen Bun install in `.github/actions/setup-bun-env`; format, lint, and typecheck in `Static Checks`; `Spec Typecheck`; `Build` with OpenAPI drift; and `test:executable-contracts` | Architecture contracts live in executable tests rather than new one-off workflow steps | Repository code |
| External Actions are immutable | Every external `uses:` reference is a full 40-character upstream commit SHA; `check-github-action-versions.ts` rejects mutable refs or inconsistent SHAs | The release tag remains as a review comment; unlabeled manual SHA pins are intentionally not moved | Repository code |
| Action updates remain routine | `bun run deps:update` calls `deps:update:actions`; the updater resolves the latest release tag to its upstream commit SHA and rewrites workflows plus composite actions | A failed lookup leaves the existing immutable pin unchanged; the weekly PR exposes every SHA change for review | Repository code |
| Untrusted pull-request code stays outside privileged event context | Code validation runs on `pull_request`; an executable workflow contract limits `pull_request_target` to `pr-title.yml` and rejects checkout or local-action execution there | Fork code cannot turn metadata validation into execution with the base repository token | Repository code |
| Fork code never receives repository secrets | GitHub fork approval policy requires approval for every external contributor; CI uses `pull_request`, and GitHub withholds secrets from fork runs | Maintainers review and apply `run-ci`; secret-consuming publish/deploy paths are not PR-triggered | GitHub setting + repository workflows |
| Secret regressions fail before merge | Gitleaks and changed-file secretlint inside `Static Checks`, held by the required `Tests Gate`; staged-content secret scan remains mandatory before commits | Findings fail Static Checks and therefore the gate | Repository code + required checks |
| Failure evidence must be actionable and bounded | Exact test-plan artifacts, Vitest JSON reports, Playwright traces/screenshots, coverage reports, SARIF uploads, and job summaries use explicit retention and `if: always()`/`failure()` where applicable | Artifacts diagnose the exact run without making advisory coverage a merge gate | Repository code |
| Production deploys only from public-repository `master` CI | Manual `Release` pins one master SHA; `Deploy hosted SaaS` validates ancestry and exact SHA; deploy jobs use the `production` environment | Community and hosted lanes ship the same SHA; failed release gates do not publish a new version | Repository workflow + environment |
| Production environment accepts only `master` | GitHub `production` deployment branch policy allowlists `master` | Environment-scoped secrets and variables are unavailable before the job reaches the environment | GitHub setting |
| Releases are reproducible and recoverable | Frozen lockfile, exact checkout SHA, generated changelog, full suite, image smoke checks, checksums, draft-first GitHub release, and fail-closed recovery evidence | Stable release publication occurs only after community and hosted lanes succeed; the recreated tag is polled, peeled if annotated, and asserted against the selected SHA, with rollback to a draft on mismatch | Repository code |

## GitHub settings audit

These controls are not stored in the repository and must be checked after
organization or repository policy changes:

- Active master ruleset `17728734` requires `PR Title`, `license/cla`,
  `Socket Security: Project Report`, and the exact aggregate context
  `Tests Gate`, with no merge queue. Every other check (gitleaks, format,
  lint, typecheck, spec typecheck, tests, build) is held by `Tests Gate`.
- Repository Actions currently default `GITHUB_TOKEN` to write. Workflows
  override that default, but administrators should change the repository
  default to read-only so a newly added workflow fails safe.
- Repository Actions allow `GITHUB_TOKEN` to create and approve pull requests
  so the trusted scheduled `deps-update.yml` workflow can deliver its one
  weekly update PR. That job explicitly grants only `contents: write` and
  `pull-requests: write`; every other configurable permission remains `none`.
  Keep the repository setting enabled while this workflow uses `GITHUB_TOKEN`,
  and keep its exact owner/head/base deduplication plus failed-creation branch
  rollback executable contract intact.
- Repository Actions currently allow all actions and do not require full-SHA
  pins at the settings layer. Repository tests enforce immutable pins after
  checkout; administrators should also enable the full-length SHA policy and,
  if operationally practical, replace `allowed_actions: all` with a reviewed
  allowlist.
- Fork workflow approval is set to all external contributors. Keep it aligned
  with the documented `run-ci` maintainer review flow.
- The `production` environment allowlists `master`, but administrator bypass is
  enabled and it has no required reviewer. For a solo-maintainer repository
  this can be an explicit availability tradeoff; if separation of duties is
  desired, disable bypass and add a reviewer without changing workflow code.
- CI failure-reporter organization-Project writes use a short-lived token
  minted from the Genfeed bot GitHub App by `.github/actions/reporter-token`
  (issues write and organization Projects write, scoped to this repository).
  The token falls back to `GITHUB_TOKEN` when the App is not configured, which
  degrades only the organization-level writes. This hardening does not
  introduce `PROJECT_BOARD_TOKEN`.

## Runtime and cost tradeoffs

This hardening adds no runner job and no pull-request critical-path work. SHA
validation runs inside the existing executable-contract suite. The weekly
Action updater makes one release lookup and one commit-resolution lookup per
Action family; the 2026-08-22 migration resolved 23 families. Immutable pins
trade automatic tag movement for reviewed weekly update PRs, which is
intentional.

The migration intentionally advances `actions/cache` from v5 to v6.1.0 rather
than representing it as a pin-only substitution. The upstream v6 release
migrates the implementation to ESM, and v6.1.0 adds read-only cache handling.
The published v5 and v6.1.0 `action.yml` contracts have the same Node 24
runtime, inputs, outputs, and restore/save entrypoints; the resolved v6.1.0 SHA
was verified against the upstream commit. PR CI remains the behavioral gate for
the three cache uses in `setup-bun-env`.

Recent successful changed-scope PR CI runs observed during the audit completed
their full required path in roughly 36 to 56 minutes, including dependency
ordering and runner waits. Rapid follow-up pushes were being cancelled within
their PR-scoped concurrency groups, so this hardening adds no routing
workflow or new critical-path job.

Seven obsolete merge-group runs still had to be cancelled after their PRs were
merged or their bases were superseded. Four zero-job runs from 2026-08-07 return
GitHub API 500 when cancellation is attempted. Issue #1850 owns the separate
merge-group cancellation and runner-waste follow-up; this change deliberately
does not add cancellation behavior.

## Intentionally deferred

- No blanket mutation-testing framework or required mutation gate. The audit
  found stronger immediate value in workflow supply-chain enforcement, and a
  universal mutation job would add substantial cost without a measured package
  target or budget.
- No new live or secret-consuming test lane. Existing release E2E, nightly full
  Playwright, self-hosted install, OpenAPI, and boot-smoke contracts already own
  those risks.
- No repository-settings mutation from CI. Required checks, default token
  permissions, Action allowlists, SHA policy, and environment reviewers remain
  deliberate administrator controls.
- No merge-group cancellation automation. Issue #1850 owns the measured
  runner-waste follow-up, including the GitHub-hosted zero-job failures.
