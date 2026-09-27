packages: @genfeedai/contracts/queue @genfeedai/contracts

Add `WORKFLOW_BACKGROUND_QUEUE` to `queue/queue-names.constant` (added to
`ALL_QUEUE_NAMES`) and a new `SystemWorkflowDispatchClass` enum
(`INTERACTIVE` | `BACKGROUND`) in `queue/system-workflow-dispatch-class.constant`.

Fixes #5271: every remaining non-user/agent-initiated
`SystemWorkflowRunnerService.enqueueWorkflow` /
`WorkflowExecutionQueueService.queueSystemWorkflow` producer (worker crons,
batch generation, the clip factory, other `workflow.for-each` fan-out,
scheduled-post dispatch, RSS/social ingestion, lifecycle emails, and the rest
of the ~40 producers audited in this PR) now enqueues onto this new,
single background queue instead of sharing `WORKFLOW_EXECUTION_QUEUE` with
interactive agent turns — the same starvation mechanism #5162 fixed for the
three platform-cron sweep templates, just via a different set of producers.

`dispatchClass` is a required option on `queueSystemWorkflow` and a required
second argument on `enqueueWorkflow`, so a new producer that omits it fails
to compile; `check-workflow-dispatch-class.ts` (wired into `check:architecture`)
additionally guards against a producer bypassing the option by injecting one
of the routed queues directly.

`WorkflowExecution.result.metadata` also gained a persisted `dispatchClass`
field (JSON, no schema migration) alongside the existing `source` — read by
`executeForEach` to route a `workflow.for-each` node's `scheduled`-mode
children by the class of the run that actually dispatched them, replacing
the removed canonical-id `isPlatformSweepWorkflow` check.
