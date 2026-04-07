# Agent Runtime Manual

Purpose: Operational playbook for long-running AI coding sessions in this repo.

Last Updated: 2026-04-07

## Operator Profile

- Runtime stack: Claude Code.
- Default quality level:
  - feature work: fast verification
  - pre-CI/pre-deploy: strict verification
- Checkpoints: write once when each task completes.
- Multi-agent runs: write completion checkpoint for each finished sub-agent task.
- Task tracking:
  - canonical backlog/status in GitHub issues
  - immediate queue in GitHub issues/projects

## Primary Goals

1. Keep delivery quality high for 6-12 hour sessions.
2. Prevent context drift and repeated mistakes.
3. Ensure every completed change has verification evidence.

## Standard Task Loop

Apply this loop for every coding task.

1. `Understand`: restate goal and constraints.
2. `Search`: find 3+ similar implementations (`rg`, targeted file reads).
3. `Plan`: define smallest safe set of edits.
4. `Edit`: make focused changes.
5. `Verify`: run scoped lint/type/tests/build checks.
6. `Summarize`: report what changed, evidence, and residual risk.

Never skip steps 2 or 5.

## Context Control

Checkpoint after each completed task.
For multi-agent work, checkpoint as each sub-agent task completes.

Checkpoint format:

- Goal now
- Files changed
- Commands run
- Current status
- Next command
- Open risk/blocker

Store session notes in `.agents/SESSIONS/YYYY-MM-DD.md` and update the related GitHub issue.

## Recovery Protocol

When blocked:

1. Capture failing command + exact error.
2. Reduce scope to smallest reproducible failure.
3. Verify assumptions with code search before new edits.
4. Try one fix path at a time.
5. If two fix paths fail, re-evaluate approach from scratch.
6. If still blocked, surface blocker to user with concrete options.

## Verification Matrix

Verification levels:

- `fast` (default for feature work)
  - `npx biome check --write <changed files>`
  - `bunx turbo lint --filter=<affected package/app>`
  - `bun type-check`

- `strict` (required before CI/deploy handoff)
  - all `fast` checks
  - affected tests
  - affected build/run checks
  - frontend QA flow when UI changed

Minimum checks by change type:

- Frontend (`apps/app/*`, `apps/admin/*`, `packages/ui/*`, `packages/hooks/*`)
  - `fast`: lint/type checks
  - `strict`: add affected tests + QA flow from `.agents/QA/README.md`

- Backend (`apps/server/*`, backend packages)
  - `fast`: lint/type checks
  - `strict`: add package-scoped tests + build/run affected service

- Shared package (`packages/*`)
  - `fast`: lint/type checks
  - `strict`: add package-scoped tests

## Completion Gate

Before saying "done":

1. All scoped verifications executed.
2. No policy violations in `CLAUDE.md` and critical docs.
3. Summary includes:
   - changed files
   - checks executed
   - remaining risks (if any)
