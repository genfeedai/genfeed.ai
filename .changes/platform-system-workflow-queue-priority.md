packages: @genfeedai/contracts/queue @genfeedai/contracts

Add `PLATFORM_SYSTEM_WORKFLOW_QUEUE` to `queue/queue-names.constant`
(added to `ALL_QUEUE_NAMES`).

Fixes #5162: platform-originated system-workflow work — platform-cron sweep
dispatches (`PlatformWorkflowSchedulesService`), the proactive agent-strategy
turns they trigger, and `workflow.for-each` children spawned from one of
those workflows — now enqueue onto this dedicated queue instead of the
shared `WORKFLOW_EXECUTION_QUEUE`, so a burst of platform-originated work can
no longer consume the concurrency or rate-limit budget an interactive agent
turn depends on.

An earlier revision of this change also added a `WORKFLOW_JOB_PRIORITY`
export and a BullMQ `priority` option on `queueSystemWorkflow`. Both were
removed after independent review (#5252): BullMQ's rate limiter is checked
before priority is ever consulted and an active job is never evicted from a
concurrency slot for a later higher-priority one, so priority on a shared
queue only reduces starvation, never prevents it — and since ~40 other
producers on that queue carry no priority at all, giving only agent turns a
priority made every one of those unprioritized producers run *ahead* of them
(BullMQ serves the plain wait list before the `prioritized` set). The
dedicated queue is the sole isolation mechanism.
