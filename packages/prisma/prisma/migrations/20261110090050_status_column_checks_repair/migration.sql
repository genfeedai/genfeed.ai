-- Repair rows written before 20261110090000_status_column_checks added the
-- checks (#9812), so the checks hold on every database this runs on, including
-- self-hosted ones nobody can query beforehand. A CHECK is evaluated on every
-- UPDATE, so one stray row left behind would refuse every later write to it.
-- Each repair writes a value the check accepts.

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
