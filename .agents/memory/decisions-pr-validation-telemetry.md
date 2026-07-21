---
name: Pull-request validation telemetry decisions
description: Collector boundary, fail-closed semantics, and surface classification decisions
type: project
---

# Pull-request Validation Telemetry Decisions

## Decision: standalone TypeScript collector

Use a repository script with a small GitHub REST client, pure analysis functions, and a thin CLI. A manually dispatched workflow invokes the same script and uploads both report formats.

**Why:** This keeps the contract testable outside Actions while avoiding a long inline `github-script` program. An external telemetry service would add deployment, credentials, and operating cost before the baseline is proven.

**How to apply:** Keep GitHub transport and filesystem output at the boundary. Keep surface classification, timing, disposition, and formatting deterministic and fixture-driven.

## Decision: final-head evidence only

Workflow and check evidence must have a head SHA equal to the merged pull request's final head SHA. Mismatched evidence is retained only as an incomplete reason, never included in latency totals.

**Why:** Mixing earlier commits into the baseline would make validation latency incomparable and overlap with the superseded-waste slice in #1967.

**How to apply:** Filter timing calculations to exact-head evidence and fail closed when any returned evidence is bound to another head.

## Decision: separate collection completeness from validation failure

Use three dispositions: `ready`, `failed`, and `incomplete`. Missing evidence outranks failure so a partial collection cannot claim a definitive validation result.

**Why:** A red check is actionable evidence; missing pages or timestamps are an evidence-quality fault. Conflating them hides collection defects.

**How to apply:** Resolve `incomplete` first, then classify terminal failure conclusions, then allow `ready`.

## Decision: classify changed files, not test coverage

Derive a pull request's surface from its changed file paths and emit `mixed` when paths span multiple surfaces.

**Why:** GitHub check names do not provide a stable, exhaustive map to product surfaces. Inferring coverage from them would create confidence the evidence does not support.

**How to apply:** Describe the field as `surface`, not `coverage`, and keep the mapping in one exported pure function.
