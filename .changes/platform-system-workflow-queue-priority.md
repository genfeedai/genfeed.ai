packages: @genfeedai/contracts/queue @genfeedai/contracts

Add `PLATFORM_SYSTEM_WORKFLOW_QUEUE` (added to `ALL_QUEUE_NAMES`) and
`WORKFLOW_JOB_PRIORITY` (`AGENT_CONVERSATION` / `DEFAULT` / `PLATFORM_SWEEP`)
to `queue/queue-names.constant`.

Fixes #5162: platform-cron sweep dispatches (`PlatformWorkflowSchedulesService`)
now enqueue onto their own BullMQ queue instead of the shared
`WORKFLOW_EXECUTION_QUEUE`, and `queueSystemWorkflow` accepts an explicit
BullMQ `priority`, so a burst of platform sweeps can no longer consume the
concurrency or rate-limit budget an interactive agent turn depends on.
