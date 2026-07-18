packages: @genfeedai/interfaces @genfeedai/queue-contracts

Harden version-bound publish execution with explicit operation, version-pin,
and execution-lease identities.

Public contract changes:
- `@genfeedai/interfaces` now owns the publish-approval service parameter and
  result interfaces. `ClaimPublishExecutionParams` requires `operationId` and
  `versionPinId`; `PublishExecutionClaim.alreadyPublished` is renamed to
  `isAlreadyPublished` and includes `executionStartedAt`; provider completion
  uses `CompletePublishExecutionParams`.
- `@genfeedai/queue-contracts` exports `ContentPipelineJobData`, replacing the
  API-local queue payload interface used by content-pipeline workers and tests.
