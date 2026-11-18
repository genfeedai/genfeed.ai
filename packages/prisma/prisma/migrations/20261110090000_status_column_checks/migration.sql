-- Pin three more status columns to their closed sets (#9812), the same way
-- 20261105210000_publish_status_checks pinned the publish columns (#8686).
-- The contracts tables from #9740 stop a bad write in code; these stop it in
-- the database.
--
-- Three migrations, so no table scan runs under the ACCESS EXCLUSIVE lock that
-- ADD CONSTRAINT takes:
-- 1. This one adds each check NOT VALID. Nothing is scanned, so the lock is
--    short, and from commit on every new write must pass the check.
-- 2. 20261110090050_status_column_checks_repair rewrites stray rows under
--    ordinary row locks. The checks already refuse new stray values, so none
--    can land after the repair.
-- 3. 20261110090100_status_column_checks_validate scans the repaired rows.

-- ContentCampaignStatus in @genfeedai/contracts.
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_status_check"
  CHECK (
    "status" IN (
      'draft', 'scheduled', 'active', 'paused', 'completed', 'archived'
    )
  ) NOT VALID;

-- TargetValidationState in @genfeedai/contracts.
ALTER TABLE "posts"
  ADD CONSTRAINT "posts_targetValidationState_check"
  CHECK (
    "targetValidationState" IN ('pending', 'valid', 'warning', 'invalid')
  ) NOT VALID;

-- ContentRunStatus in @genfeedai/contracts. The column stays nullable.
ALTER TABLE "content_runs"
  ADD CONSTRAINT "content_runs_status_check"
  CHECK ("status" IN ('pending', 'running', 'completed', 'failed'))
  NOT VALID;
