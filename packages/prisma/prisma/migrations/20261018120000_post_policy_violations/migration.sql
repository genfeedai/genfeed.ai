-- Brand OS Policy violations on a draft (#7339).
--
-- The rules a draft broke at its last unattended publish evaluation, so the
-- review item names them. Additive with an empty default: existing rows carry
-- no violations.
ALTER TABLE "posts"
  ADD COLUMN "policyViolations" JSONB NOT NULL DEFAULT '[]';
