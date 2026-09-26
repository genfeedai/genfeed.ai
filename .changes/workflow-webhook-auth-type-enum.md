packages: @genfeedai/contracts

Add `WorkflowWebhookAuthType` (`none` | `secret` | `bearer`) to
`packages/contracts/src/enums/workflow.enum.ts`, re-exported from `./enums`.

This is the runtime source of truth for a workflow's public inbound-webhook
auth mode, which was previously an inline, unvalidated
`'none' | 'secret' | 'bearer'` union on both the write path
(`WorkflowWebhookManagementController.generateWebhook`'s request body) and
the read path (`WebhooksController.triggerWebhook`, the public unauthenticated
trigger). A `GenerateWorkflowWebhookDto` with `@IsEnum(WorkflowWebhookAuthType)`
now validates the write path, and the trigger endpoint validates any stored
value against this enum at read time and rejects anything else with 401
instead of silently skipping authentication — see
https://github.com/genfeedai/genfeed.ai/issues/5248.
