-- The conversion sweep reads accepted-message cohorts by organization, goal and
-- acceptance time. Without this the scan falls back to the organization prefix
-- of an index ordered by clickedAt.
CREATE INDEX IF NOT EXISTS "email_messages_organizationId_goal_acceptedAt_idx"
  ON "email_messages" ("organizationId", "goal", "acceptedAt");
