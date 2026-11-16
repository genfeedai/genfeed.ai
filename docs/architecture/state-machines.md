# Status state machines

Generated from `STATE_MACHINE_CATALOG` in `packages/contracts/src/enums/state-machine.registry.ts`.
Do not edit by hand: run `UPDATE_STATE_MACHINE_DOC=1 bunx vitest run state-machine.registry`
in `packages/contracts` after changing a table.

Each table is the set of edges a writer may take. Writers stay compare-and-set:
`machine.sourcesOf(to)` is the `status: { in }` list for an `updateMany`. "Settled"
means the lifecycle is finished for polling and display; a settled state may still
have an explicit edge (a retry, or a discarded batch).

Lifecycles that are explicit but not built with `defineStateMachine`:
`Post.targetExecutionState` (`POST_LIFECYCLE_TRANSITIONS`), `Task.status`
(`STATUS_TRANSITIONS`), `PublishApproval.status`
(`canTransitionPublishApprovalStatus`), `BrandedGenerationReceipt.state`
(`canTransitionBrandedGenerationStateV1`) and the agent chat stream phase
(`docs/architecture/agent-chat-stream-phases.md`). `docs/architecture/status-columns.md`
lists every plain-string status column and how explicit its lifecycle is.

## `Campaign.status`

Constant: `CONTENT_CAMPAIGN_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `draft` | no | `active`, `paused`, `completed`, `archived` |
| `scheduled` | no | `active`, `paused`, `completed`, `archived` |
| `active` | no | `paused`, `completed`, `archived` |
| `paused` | no | `active`, `completed`, `archived` |
| `completed` | yes | `archived` |
| `archived` | yes | `draft`, `scheduled`, `active`, `paused`, `completed` |

## `Ingredient.status`

Constant: `INGREDIENT_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `DRAFT` | no | `PROCESSING`, `UPLOADED`, `GENERATED`, `FAILED` |
| `PROCESSING` | no | `UPLOADED`, `GENERATED`, `FAILED` |
| `UPLOADED` | yes | `VALIDATED`, `REJECTED`, `ARCHIVED` |
| `GENERATED` | yes | `VALIDATED`, `REJECTED`, `ARCHIVED` |
| `VALIDATED` | yes | `REJECTED`, `ARCHIVED` |
| `FAILED` | yes | `PROCESSING`, `ARCHIVED` |
| `ARCHIVED` | yes | — |
| `REJECTED` | yes | `VALIDATED`, `ARCHIVED` |

## `Post.targetValidationState`

Constant: `TARGET_VALIDATION_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `pending` | no | `valid`, `warning`, `invalid` |
| `valid` | no | `warning`, `invalid` |
| `warning` | no | `valid`, `invalid` |
| `invalid` | no | `valid`, `warning` |

## `TurboProjectItem.status`

Constant: `TURBO_PROJECT_ITEM_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `PENDING` | no | `GENERATING` |
| `GENERATING` | no | `PENDING`, `READY`, `FAILED` |
| `READY` | yes | `APPROVED`, `REJECTED` |
| `FAILED` | yes | `GENERATING` |
| `APPROVED` | yes | `READY`, `REJECTED` |
| `REJECTED` | yes | `READY`, `APPROVED` |

## `TurboRun.status`

Constant: `TURBO_RUN_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `PENDING` | no | `PROCESSING`, `FAILED`, `CANCELLED` |
| `PROCESSING` | no | `PROCESSING`, `COMPLETED`, `PARTIAL`, `FAILED`, `CANCELLED` |
| `COMPLETED` | yes | `CANCELLED` |
| `PARTIAL` | yes | `CANCELLED` |
| `FAILED` | yes | `CANCELLED` |
| `CANCELLED` | yes | — |

## `TurboRunItem.status`

Constant: `TURBO_RUN_ITEM_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `PENDING` | no | `PROCESSING`, `FAILED`, `SKIPPED` |
| `PROCESSING` | no | `PENDING`, `COMPLETED`, `FAILED` |
| `COMPLETED` | yes | `SKIPPED` |
| `FAILED` | yes | — |
| `SKIPPED` | yes | `FAILED` |

## `WorkflowExecution.status`

Constant: `WORKFLOW_EXECUTION_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `PENDING` | no | `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `RUNNING` | no | `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `COMPLETED` | yes | — |
| `FAILED` | yes | `RUNNING` |
| `CANCELLED` | yes | — |

## `WorkflowNodeContinuation.status`

Constant: `WORKFLOW_NODE_CONTINUATION_STATE_MACHINE` in `@genfeedai/contracts`.

| From | Settled | Can move to |
|---|---|---|
| `PENDING_SUBMISSION` | no | `WAITING_PROVIDER`, `PROVIDER_SUCCEEDED`, `PROVIDER_FAILED`, `RESUMING`, `FAILED` |
| `WAITING_PROVIDER` | no | `WAITING_PROVIDER`, `PROVIDER_SUCCEEDED`, `PROVIDER_FAILED`, `RESUMING`, `FAILED` |
| `PROVIDER_SUCCEEDED` | no | `PROVIDER_SUCCEEDED`, `RESUMING` |
| `PROVIDER_FAILED` | no | `PROVIDER_SUCCEEDED`, `RESUMING` |
| `RESUMING` | no | `PROVIDER_SUCCEEDED`, `RESUMING`, `COMPLETED`, `FAILED` |
| `COMPLETED` | yes | — |
| `FAILED` | yes | — |
