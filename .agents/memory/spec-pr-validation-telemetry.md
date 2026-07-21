---
name: Pull-request validation telemetry
description: Exact-head, read-only validation evidence contract for issue #1966
type: project
---

# Pull-request Validation Telemetry

## Goal

Produce deterministic JSON and Markdown evidence for the final head of a bounded set of merged pull requests. The report measures pull-request validation latency without mutating repository state or presenting partial evidence as ready.

**Why:** Epic #1850 needs a trustworthy baseline before later work can reduce superseded runs, redundant validation, or latency budgets.

**How to apply:** Use the collector and manual workflow introduced by #1966 for the baseline. Treat every observation as bound to the repository, pull request, base branch, and final head SHA recorded in the report.

## Inputs

- Repository in `owner/name` form.
- GitHub token with read access to pull requests, actions, checks, and contents.
- Either an explicit comma-separated pull-request selection or a recent merged-pull-request limit.
- A limit from 20 through 100; the workflow default is 20.

## Evidence contract

Each pull-request observation records:

- repository, pull-request number and URL, base branch and SHA, and final head SHA;
- merged and authored timestamps;
- changed-file surface classification;
- exact-head workflow-run and check-run counts;
- queue delay, execution duration, and critical-path duration;
- the slowest completed checks;
- a `ready`, `failed`, or `incomplete` disposition;
- explicit incomplete reasons.

The report records collection time, selection mode, requested limit or explicit numbers, aggregate disposition counts, and per-surface counts. JSON is the versioned machine contract; Markdown is a concise human projection of the same observations.

Queue delay is the maximum workflow `created_at` → `run_started_at` interval. Execution duration is the maximum workflow `run_started_at` → terminal `updated_at` interval. Critical path spans the earliest workflow creation or check start through the latest workflow/check completion.

Recent selection uses GitHub's REST search with a bounded `merged:>=YYYY-MM-DD` window. It collects the complete window, then orders by `merged_at` before selecting the requested sample. The collector expands the window until it contains enough pull requests and refuses a window above GitHub Search's 1,000-result retrieval ceiling.

## Fail-closed rules

An observation is `incomplete` when any required REST collection page fails, pagination cannot complete, the changed-file list is empty, no exact-head workflow/check evidence exists, evidence points at a different head SHA, or a required timestamp is missing or invalid.

An observation is `failed` only when collection is complete and an exact-head workflow or check has a failing or cancelled terminal conclusion. It is `ready` only when collection is complete, all exact-head evidence is terminal, and no failure conclusion exists.

`ready` describes the collected validation evidence. It is not proof of branch-protection configuration, review approval, mergeability, or deployment readiness.

## Surface classification

Changed files map to these non-overlapping report surfaces:

- `app`: `apps/app/**`
- `api`: `apps/server/**`
- `desktop`: `apps/desktop/**`
- `documentation`: `apps/docs/**`, `docs/**`, and Markdown files
- `package`: `packages/**` and `ee/packages/**`
- `repository`: other repository-level files
- `mixed`: more than one of the preceding surfaces

Classification describes changed files only. It does not claim that a surface received test coverage.

## Non-goals

- Measuring superseded-commit waste (#1967).
- Changing concurrency, caching, workflow topology, or branch protection (#1968).
- Enforcing latency budgets (#1969).
- Commenting on pull requests or changing checks, labels, repository settings, or project data.

## Verification

- Pure fixtures cover complete, missing-timestamp, cancelled, skipped, mixed-surface, and pagination behavior.
- A contract test pins the workflow's manual trigger, minimum default sample, read-only permissions, and artifact outputs.
- Repository CI runs the focused tests and existing type/lint gates.
