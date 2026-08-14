---
name: code CI not workflow gates
description: Product contracts belong in tests; do not add named ratchet steps to the CI guards job
type: feedback
---

**Rule:** Executable product contracts live in tests (`scripts/ci/executable-contracts.test.ts`, `scripts/architecture/*.test.ts`, and the other vitest configs `test:executable-contracts` runs). The `guards` job in `.github/workflows/ci.yml` runs that one script. Do not add a new named YAML step for a `bun run check:*` ratchet or a cherry-picked architecture test file.

**Why:** A 40-step guards job is a graveyard. Each ratchet gets a forever-green workflow name while the product moves, CI stays long, and deleting a dead rule means editing YAML. Tests die with the code.

**How to apply:**

1. New contract: add or extend a test. Repo scanners go in `scripts/ci/executable-contracts.test.ts`. Checker unit tests stay next to the checker under `scripts/architecture/`.
2. Do not restore `check:architecture` as a CI job, and do not wire individual `check:*` scripts into `ci.yml`.
3. When a contract is obsolete, delete the test. Do not leave a disabled YAML comment.
4. `check:*` package.json scripts may remain for local/pre-commit use; they are not CI job names.
