# Codebase Health

Genfeed uses Fallow for codebase-health telemetry. Fallow is not part of the
runtime path and is not part of the deployment path.

## What Runs

- Pull requests run `Fallow PR Audit` from `.github/workflows/codebase-health.yml`
  when TypeScript, JavaScript, CSS, package, workflow, or Fallow config files
  change.
- The PR audit is scoped to changed code with `gate: new-only`, posts a compact
  report, and uses `fail-on-issues: false`.
- The weekly Monday 09:00 UTC workflow runs full-repo `health`, `dead-code`,
  `dupes`, a machine-readable runtime-complexity census, skills integrity, and
  full React Doctor checks.
- Full-repo Fallow jobs are report-only until the backlog is intentionally
  burned down.
- Pull-request CI blocks changed production controllers over 500 lines,
  services/processors/gateways/resolvers over 1,000 lines, methods over 150
  lines, and constructors with more than 15 dependencies.
- The weekly runtime-complexity census is report-only while decomposition debt
  remains and is retained as a workflow artifact for 30 days.

## Health Policy

The original issue #83 baseline was 72/100 with the largest known backlog areas
in unused dependencies, circular dependencies, and dead files. A local pinned
Fallow 2.96.0 smoke on this branch returned 55.8/C with 13.0% dead files, 46
circular dependencies, and 79 unused dependencies, but that run also warned that
`node_modules` was absent. Treat the first post-merge weekly CI run with this
config as the operating baseline.

- After the first post-merge baseline, score below 70 opens a follow-up issue
  for regression triage.
- After the first post-merge baseline, score below 60, or a drop of 10 or more
  points from the previous weekly report, is a release-risk investigation before
  cutting a release.
- Score 80 or higher for three consecutive weekly runs: consider enabling a
  blocking PR audit or category-specific gates.
- Fallow findings do not block deploys unless this policy is changed in a
  separate PR and the required status checks are updated intentionally.

## Backlog Triage

Triage full-repo findings in this order:

1. Circular dependencies crossing package or server-service boundaries.
2. Unused dependencies in workspace manifests.
3. Dead files outside generated, build, fixture, and documentation paths.
4. Duplicated logic across app/package boundaries.
5. Localized complexity hotspots that are already touched by product work.

Do not batch-delete dead files from Fallow output alone. Deletions need normal
review evidence that the file is outside dynamic loading, framework conventions,
generated artifacts, migrations, or public package API.

## Deployment Impact

This workflow is intentionally separate from ECS, Vercel, Docker publish, and
release verification workflows. Adding PR-scoped Fallow audit may add a parallel
PR check and runner minutes, but it does not increase production deployment time.
