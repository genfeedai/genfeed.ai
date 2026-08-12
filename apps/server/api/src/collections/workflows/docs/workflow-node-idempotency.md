# Workflow node idempotency (#2359)

## Strategy

1. **BullMQ job retry:** `WorkflowExecutionProcessor` persists `priorExecutionIds` after the first trigger attempt. On `attemptsMade > 0` with those ids, it **does not** call `handleTriggerEvent` again (would spawn new executions and re-fire publish/DM/credits).

2. **Durable claims:** table `workflow_node_claims` unique on `(executionId, nodeId)`. Insert `status=running` before dispatch; on P2002 load the existing row and re-emit. Complete with `completed`/`failed` + output.

3. **Same-execution re-entry:** graph runner hydrates completed `nodeResults` from the execution row and keeps an in-process claim map.

## Publish / credit-spend nodes

| Node family | Idempotency |
|---|---|
| Publish / schedule post tools | Durable claim skips re-dispatch; post create should also be safe under existing post/approval uniqueness where present |
| Credit spend / batch charge | Prefer ledger reference ids (`batch-generation:upfront`, settlement CAS); claims prevent double tool invocation |
| DM / engagement send | Durable claim is the primary guard; provider-side message ids are secondary if the vendor supports them |

Handlers must not assume “run once” without a claim row or an external idempotency key.
