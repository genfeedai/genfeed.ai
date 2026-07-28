---
name: Adaptive pull-request validation
description: Exact affected-test planning, adaptive Vitest sharding, and conditional workspace runners for issue #1850
type: project
---

# Adaptive Pull-Request Validation Spec

## Purpose

Reduce the pull-request validation critical path without removing tests or
weakening the stable Tests Gate. The planner preserves the existing Vitest
`--changed` dependency-graph selection and Turbo `--affected` package selection,
then avoids empty runners and parallelizes large affected test sets.

**Why:** A localized API pull request selected 56 test files and completed the
test phase in 165 seconds, while a shared-interface pull request selected 696
test files and ran for 1,259 seconds on one two-worker runner. The selector was
correct; the single-runner execution topology was the bottleneck.

**How to apply:** Treat the generated plan as the source of applicability for
pull-request test jobs. Preserve the exact changed-test selection, shard it
adaptively, and fail closed when the plan or an applicable job is missing.

## Non-Goals

- Removing tests, assertions, security checks, or architecture contracts.
- Replacing Vitest or Turbo dependency analysis with a hand-maintained complete
  dependency graph.
- Optimizing scheduled E2E, coverage, or release workflows.
- Changing branch-protection settings.

## Interfaces

The CI planner receives the Git event, base SHA, and heavy-suite input. It emits:

- app and API surface applicability;
- full-suite escalation;
- app and API affected test-file counts;
- one-, two-, or four-shard matrices for changed tests;
- affected booleans for package, server-service, web/desktop/mobile, and
  extension test groups;
- a JSON manifest containing the exact planned test files and affected Turbo
  tasks.

## Edge Cases And Failure Modes

- Invalid or incomplete Vitest/Turbo output fails the plan.
- A missing plan output never converts an applicable job into success.
- Zero affected tests skip the corresponding runner and are recorded explicitly.
- Root dependency, test configuration, setup-action, or CI workflow changes
  escalate to the existing full sharded validation path.
- Full-suite workflow calls remain independent from ordinary pull-request runs.
- Ordinary label changes do not restart the complete CI workflow.

## Acceptance Criteria

- WHEN Vitest selects 1–75 affected files THE SYSTEM SHALL run one changed-test
  shard.
- WHEN Vitest selects 76–250 affected files THE SYSTEM SHALL run two
  changed-test shards.
- WHEN Vitest selects more than 250 affected files THE SYSTEM SHALL run four
  changed-test shards.
- WHEN changed tests are sharded THE SYSTEM SHALL retain the same base SHA,
  Vitest configuration, and `--changed` selector on every shard.
- WHEN a Turbo test group contains no affected task THE SYSTEM SHALL skip its
  runner before checkout and dependency setup.
- IF planning fails or an applicable job is skipped, cancelled, or failed THEN
  Tests Gate SHALL fail closed.
- WHEN root dependencies, Vitest configuration, the Bun setup action, or the CI
  workflow changes THE SYSTEM SHALL run the full sharded validation path.
- WHEN a pull request receives a label other than `full-suite` THE SYSTEM SHALL
  not restart CI.
- WHEN a pull request receives the `full-suite` label THE SYSTEM SHALL invoke
  the reusable CI workflow with heavy tests enabled.
- THE SYSTEM SHALL upload the pull-request test plan as a bounded JSON artifact.

## Test Plan

- Unit-test changed-file classification, shard thresholds, manifest parsing,
  Turbo task applicability, and fail-closed invalid input.
- Contract-test workflow triggers, dynamic matrices, exact `--changed` sharding,
  conditional workspace jobs, full-suite escalation, and Tests Gate inputs.
- Run formatter, static JavaScript syntax checks, and actionlint locally.
- Use pull-request CI for tests, typechecks, and builds per machine policy.
