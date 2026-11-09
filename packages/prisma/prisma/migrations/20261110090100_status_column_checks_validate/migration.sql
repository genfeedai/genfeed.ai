-- Validates the constraints 20261110090000_status_column_checks added NOT
-- VALID. Kept in its own migration (its own transaction) so the scans do not
-- extend the locks taken by the DDL there. VALIDATE takes SHARE UPDATE
-- EXCLUSIVE, so reads and writes continue while each table is scanned. The
-- repair in 20261110090000 leaves no row outside its set.
ALTER TABLE "campaigns" VALIDATE CONSTRAINT "campaigns_status_check";

ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_targetValidationState_check";

ALTER TABLE "content_runs" VALIDATE CONSTRAINT "content_runs_status_check";
