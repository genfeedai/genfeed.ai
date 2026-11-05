-- Validates the constraints 20261105210000_publish_status_checks added NOT
-- VALID. Kept in its own migration (its own transaction) so the scans do not
-- extend the locks taken by the DDL there. VALIDATE takes SHARE UPDATE
-- EXCLUSIVE, so reads and writes continue while each table is scanned. It
-- fails, and stops the deploy, if any existing row is outside its set: run the
-- read-only pre-deploy query from the PR first.
ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_targetExecutionState_check";

ALTER TABLE "post_groups" VALIDATE CONSTRAINT "post_groups_status_check";

ALTER TABLE "post_provider_publish_receipts"
  VALIDATE CONSTRAINT "post_provider_publish_receipts_status_check";

ALTER TABLE "notification_deliveries"
  VALIDATE CONSTRAINT "notification_deliveries_status_check";
