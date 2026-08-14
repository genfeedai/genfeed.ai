---
name: no new CI guard steps
description: Do not add named workflow steps or YAML ratchets for architecture contracts
type: feedback
status: active
last_verified: 2026-08-14
topics: [ci, workflow, guards]
---

**Rule:** Do not add new named steps to `.github/workflows/ci.yml` (or sibling workflows) for architecture/collection/coverage contracts. Do not pin those steps from `pr-validation-workflows.test.mjs`.

**Why:** Vincent rejected the Test Collection Guard steps on #2947. The guards job is already a long list of one-off checks, and #2946 (`chore/ci-executable-contracts`) is the lane that turns remaining YAML ratchets into executable tests. More named steps are noise.

**How to apply:**

- Keep a local `package.json` script if the check is useful to run by hand.
- If a contract must stay enforced, fold it into an existing executable test file / the existing `node --test scripts/ci/*.test.mjs` suite — do not open a new `guards` step.
- Do not add a workflow pin that exists only to prevent the step from being deleted.
- On collision with #2946, leave `ci.yml` and `pr-validation-workflows.test.mjs` alone.
