-- Supporting index for the stale-pending system-workflow keyset sweep (#5319).
--
-- Query shape: StalePendingSystemExecutionFinderService.queryPage —
--   WHERE "status" = 'PENDING'
--     AND "isDeleted" = false
--     AND "createdAt" >= / < (cohort bound)
--     AND (keyset cursor: "createdAt" > $cursor OR ("createdAt" = $cursor AND "id" > $cursorId))
--   ORDER BY "createdAt" ASC, "id" ASC
--   LIMIT 200
-- (apps/server/api/src/collections/workflow-executions/services/stale-pending-system-execution-finder.service.ts)
--
-- PendingWorkflowExecutionReconcileService's cohort sweeps now carry a
-- `(createdAt, id)` keyset cursor across ticks so a backlog of rows that
-- keep a live BullMQ job cannot starve rows further back in the scan. The
-- existing indexes on this table are org-scoped
-- (organizationId, isDeleted, createdAt desc) or built for the unrelated
-- failure feed (status, isDeleted, failureReason, completedAt desc, id) —
-- neither has a leading, ascending (createdAt, id) pair for this
-- cross-tenant, status-first, ascending-order scan, so without this index
-- every page would sort the matching PENDING rows from scratch.
--
-- A partial index restricted to `status = 'PENDING'` keeps the index small:
-- PENDING system-workflow rows are expected to be a tiny, transient slice of
-- this table, and every other status is irrelevant to this sweep.
--
-- Built CONCURRENTLY: workflow_executions is written continuously by live
-- runs, so a blocking btree build would stall those writes. Prisma can
-- execute a migration outside its transaction when the file contains only
-- bare CREATE INDEX CONCURRENTLY statements (see
-- 20260905120100_agent_failure_feedback_index and
-- 20260814020100_context_entry_pending_embedding_index).
--
-- `IF NOT EXISTS` makes the build a no-op if already applied. If the build
-- fails it leaves an INVALID index of the same name — drop it before
-- retrying.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_stale_pending_sweep_idx"
  ON "workflow_executions" ("createdAt", "id")
  WHERE "status" = 'PENDING'::"WorkflowExecutionStatus"
    AND "isDeleted" = false;
