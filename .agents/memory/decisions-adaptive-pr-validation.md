---
name: Adaptive pull-request validation decisions
description: Architecture and QA-preservation decisions for adaptive pull-request validation
type: project
---

# Adaptive Pull-Request Validation Decisions

## Decision: preserve selection and change execution topology

Keep Vitest `--changed` as the authoritative app/API affected-test selector.
Use `vitest list --changed --filesOnly --json` to measure the same graph before
execution, then run that selector with an adaptive shard matrix.

**Why:** Replacing the graph with path-only rules is faster to implement but can
miss indirect consumers. Always running four shards preserves coverage but
wastes runners for small changes. Adaptive sharding preserves the graph and
uses parallelism only when the selected file count warrants it.

## Decision: use 1/2/4 initial shard thresholds

Use one shard through 75 files, two through 250, and four above 250.

**Why:** Live evidence shows 56 API files complete quickly on one runner while
696 files control a 25-minute critical path. The existing four-shard full suite
already proves the repository can execute the large suite safely in parallel.
The thresholds are explicit policy and can be ratcheted from exact-head
telemetry without changing selection semantics.

## Decision: plan Turbo applicability before runner startup

Use Turbo `--affected --dry=json` for each existing workspace group and launch a
group job only when its plan contains a task.

**Why:** The current jobs perform checkout and Bun setup before Turbo discovers
that a group contains no affected work. Planning moves that decision ahead of
runner allocation while retaining Turbo's package and dependent graph.

## Decision: full-suite escalation remains fail-closed

Escalate root dependency, Vitest configuration, Bun setup-action, and CI
workflow changes to the existing full sharded path. Keep release/full-suite
workflow calls unchanged.

**Why:** Those files can alter selection, execution, caching, or every workspace.
Running the complete matrix is rare and provides direct evidence for changes to
the validation machinery itself.

## Decision: isolate label dispatch from ordinary CI

Remove `labeled` and `unlabeled` from the main CI trigger. Add a small
pull-request-label workflow that calls reusable CI only when the added label is
`full-suite`.

**Why:** GitHub Actions cannot filter `pull_request.labeled` by label name at
the trigger boundary. Keeping label events on the main workflow creates
cancelled runs for routine automation labels. A dedicated dispatcher preserves
the on-demand gate without restarting CI for unrelated labels.
