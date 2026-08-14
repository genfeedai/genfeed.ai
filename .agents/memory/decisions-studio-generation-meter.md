---
name: Honest Studio generation meter decisions
description: Approach choice for showing Studio credit and queue honesty
type: project
status: active
last_verified: 2026-08-14
topics: [studio, credits, prompt-bar]
---

# Decisions — Honest Studio generation meter

## Approaches

1. **Tooltip-only on Generate** — cheapest. Hidden. Fails the Higgsfield lesson (users cannot see the meter).
2. **Compact meter beside Generate** — reuses `selectedModelCost` + `activeGenerations`, visible in Simple Mode, same density as the agent context chip.
3. **Banner / notice** — too loud for Simple Mode; looks like an error.

**Chose 2.**

## Rejected

- Invented wait minutes from a hardcoded model table. We have no measured latency. Lying about wait is the Higgsfield bug.
- Backend queue API this slice. Out of scope.
- Refund work this slice. Batch/eval refunds already exist; ingredient cancel is a separate PRD if Studio jobs still settle on failure.

## Assumptions

- `activeGenerations` is the honest in-session queue. It is not a provider-wide wait.
- Default-model cost is good enough for Simple Mode until auto-select returns the chosen model to the client.
