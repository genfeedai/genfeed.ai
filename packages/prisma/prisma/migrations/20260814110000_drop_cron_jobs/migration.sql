-- Drop leftover cron-jobs product tables. Scheduling is workflow-canonical
-- (ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL). Rows were only written by the
-- deleted REST/dispatcher surface; remaining product schedules live on Workflow.
DROP TABLE IF EXISTS "cron_runs";
DROP TABLE IF EXISTS "cron_jobs";
DROP TYPE IF EXISTS "CronRunStatus";
DROP TYPE IF EXISTS "CronJobStatus";
