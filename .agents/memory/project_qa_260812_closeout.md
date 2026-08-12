---
name: qa/260812 closeout
description: State of the qa/260812 launch-blocker PR and what remains after merge
type: project
status: active
last_verified: 2026-08-12
---

# `qa/260812` launch closeout

## PR

- Draft: https://github.com/genfeedai/genfeed.ai/pull/2820
- Branch: `qa/260812`
- On merge (with `Closes` in body): #2738 #2696 #1626 #2420 #2359

## Code complete in branch (do not re-implement)

- Replicate fail-closed secret + untrusted deferral + factory provider
- Batch credits reserve/settle, platform validate, UI estimate, largest-remainder
- agent_messages cursor migration (master’s CONCURRENTLY create-new + drop-old)
- Article label/title ratchet (Sentry 71/72)
- Workflow node claims table + BullMQ continueExistingExecution on retry
- Bootstrap query bounds + slim agent-run list select
- #2702 brand bootstrap guard tests (defer until brands resolve; release on unresolved)
- Claim-service edge cases (running/failed/missing-row P2002, tenant-scoped where)
- Batch create platform normalize rejection/dedupe tests (#2696)
- Hermetic contracts: durable claim complete on throw path; #2702 bootstrap pins
- Processor: empty priorExecutionIds fallthrough + delay resume on continue path
- continueExistingExecution no-ops CANCELLED (not only COMPLETED)
- Batch process rejects invalid platforms *before* generateContent
- BatchGenerationCard recomputes estimate when platforms leave suggestion
- Agent tool cancels orphan batch when credit reserve fails after create
- generateContentBatch reserve/cancel/queue unit tests
- continueExistingExecution re-enters PENDING under same id + org-scoped find
- cancelBatch marks only pending items SKIPPED (tenant-scoped)

## After merge (human / deploy)

1. Push once when ready for CI; mark PR ready after green.
2. Deploy tip; confirm Sentry 71/72 quiet.
3. Confirm nightly E2E green (#1626) or re-open for a new failure class.
4. Prod sale path: #738 #334 #2343 #2086.
5. Close #2702 when accepted — product fix already on master (#2733); tests/contracts on this branch; board note posted 2026-08-12.

## Agent rules for this branch

- Prefer **commit only, no push** while iterating (avoids thrashing PR CI).
- Do not leave `qa/260812` for side branches unless Vincent asks.
