CREATE TYPE "AgentFailureReason" AS ENUM (
  'PROVIDER_CONFIGURATION', 'INSUFFICIENT_CREDITS', 'RATE_LIMITED', 'TIMEOUT',
  'DATA_SAVE_FAILED', 'SESSION_EXPIRED', 'CONNECTION_INTERRUPTED', 'CANCELLED',
  'PROVIDER_AUTHENTICATION', 'WORKSPACE_MISSING', 'ACTION_NOT_ALLOWED',
  'MODEL_UNAVAILABLE', 'PROVIDER_ACCESS_DENIED', 'PROVIDER_UNAVAILABLE', 'UNKNOWN'
);

ALTER TABLE "workflow_executions"
  ADD COLUMN "failureReason" "AgentFailureReason",
  ADD COLUMN "failure" JSONB;

UPDATE "workflow_executions"
SET "failureReason" = 'UNKNOWN'
WHERE "status" = 'FAILED';

CREATE INDEX "workflow_executions_failure_feed_idx"
  ON "workflow_executions" ("status", "isDeleted", "failureReason", "completedAt" DESC, "id");
