-- Drop the unreachable ContentSchedule REST/cron model (#2665).
-- The collection had no app/cli/agent/mcp callers; scheduling is workflow-canonical
-- (ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL). Rows were only written by the
-- deleted REST surface and consumed by the deleted contentScheduleRun executor.
DROP TABLE IF EXISTS "content_schedules";
