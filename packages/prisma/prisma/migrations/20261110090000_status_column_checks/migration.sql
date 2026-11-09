-- Pin three more status columns to their closed sets (#9812), the same way
-- 20261105210000_publish_status_checks pinned the publish columns (#8686).
-- The contracts tables from #9740 stop a bad write in code; these stop it in
-- the database.
--
-- Repair first, so the checks hold on every database this runs on, including
-- self-hosted ones nobody can query beforehand. A CHECK is evaluated on every
-- UPDATE, so one stray row left behind would refuse every later write to it.

-- Onboarding draft runs once wrote 'complete' and 'interrupted'; readers still
-- treated them as completed and failed. Any other stray value is a run that
-- can no longer be followed, so it is failed.
UPDATE "content_runs"
  SET "status" = 'completed'
  WHERE "status" = 'complete';

UPDATE "content_runs"
  SET "status" = 'failed'
  WHERE "status" IS NOT NULL
    AND "status" NOT IN ('pending', 'running', 'completed', 'failed');

-- Every validation run recomputes the state, so pending is always safe.
UPDATE "posts"
  SET "targetValidationState" = 'pending'
  WHERE "targetValidationState" NOT IN ('pending', 'valid', 'warning', 'invalid');

-- A campaign in an unknown state is paused: it stops acting until an operator
-- resumes it.
UPDATE "campaigns"
  SET "status" = 'paused'
  WHERE "status" NOT IN (
    'draft', 'scheduled', 'active', 'paused', 'completed', 'archived'
  );

-- NOT VALID enforces each check on new writes immediately without scanning the
-- existing rows; 20261110090100_status_column_checks_validate scans them.

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
