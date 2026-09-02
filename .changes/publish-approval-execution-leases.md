packages: @genfeedai/contracts/interfaces @genfeedai/contracts/queue

Harden version-bound publish execution with explicit operation, version-pin,
and execution-lease identities.

Public contract changes:
- `@genfeedai/contracts/interfaces` now owns the publish-approval service parameter and
  result interfaces. `ClaimPublishExecutionParams` requires `operationId` and
  `versionPinId`; `PublishExecutionClaim.alreadyPublished` is renamed to
  `isAlreadyPublished` and includes `executionStartedAt`; provider completion
  uses `CompletePublishExecutionParams`.
- `@genfeedai/contracts/queue` exports `ContentPipelineJobData`, replacing the
  API-local queue payload interface used by content-pipeline workers and tests.
