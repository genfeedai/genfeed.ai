import type { WorkflowNodeResult } from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionStatus as SharedWorkflowExecutionStatus } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';

export type WorkflowExecutionEtaUpdate = {
  currentPhase?: string;
  estimatedDurationMs?: number;
  etaConfidence?: string;
  lastEtaUpdateAt?: string;
  remainingDurationMs?: number;
  startedAt?: string;
};

/** The execution's scalar ETA columns; an absent value leaves its column as is. */
export function toEtaColumns(eta: WorkflowExecutionEtaUpdate | undefined) {
  const etaUpdatedAt = eta?.lastEtaUpdateAt
    ? new Date(eta.lastEtaUpdateAt)
    : eta
      ? new Date()
      : undefined;
  return {
    estimatedDurationMs: eta?.estimatedDurationMs,
    etaConfidence: eta?.etaConfidence,
    etaCurrentPhase: eta?.currentPhase,
    etaUpdatedAt:
      etaUpdatedAt && !Number.isNaN(etaUpdatedAt.getTime())
        ? etaUpdatedAt
        : undefined,
    remainingDurationMs: eta?.remainingDurationMs,
  };
}

/**
 * One statement that upserts a node result, recomputes the execution's
 * progress from its node results and, when given, writes the execution ETA.
 * A node transition therefore costs a single database round trip.
 */
export function buildNodeResultProgressQuery(
  executionId: string,
  nodeResult: WorkflowNodeResult,
  totalNodes?: number,
  eta?: WorkflowExecutionEtaUpdate,
): Prisma.Sql {
  const nodeId = nodeResult.nodeId;
  const nodeType = nodeResult.nodeType || 'unknown';
  const status = String(nodeResult.status);
  const inputJson =
    nodeResult.input === undefined ? null : JSON.stringify(nodeResult.input);
  const outputJson =
    nodeResult.output === undefined ? null : JSON.stringify(nodeResult.output);
  const error = nodeResult.error ?? null;
  const startedAt = nodeResult.startedAt ?? null;
  const completedAt = nodeResult.completedAt ?? null;
  const nodeProgress = nodeResult.progress ?? null;
  const retryCount = nodeResult.retryCount ?? null;
  const creditsUsed = nodeResult.creditsUsed ?? null;
  const useStoredNodeCount = totalNodes === undefined;
  const expectedNodeCount = totalNodes ?? 0;
  const etaColumns = toEtaColumns(eta);

  return Prisma.sql`
    WITH upserted AS (
      INSERT INTO workflow_execution_node_results (
        id,
        "organizationId",
        "executionId",
        "nodeId",
        "nodeType",
        status,
        input,
        output,
        error,
        "startedAt",
        "completedAt",
        progress,
        "retryCount",
        "creditsUsed",
        "createdAt",
        "updatedAt"
      )
      SELECT
        concat('wer_', e.id, '_', ${nodeId}::text),
        e."organizationId",
        e.id,
        ${nodeId}::text,
        ${nodeType}::text,
        ${status}::text,
        ${inputJson}::jsonb,
        ${outputJson}::jsonb,
        ${error}::text,
        ${startedAt}::timestamp,
        ${completedAt}::timestamp,
        ${nodeProgress}::int,
        ${retryCount}::int,
        ${creditsUsed}::int,
        NOW(),
        NOW()
      FROM workflow_executions AS e
      WHERE e.id = ${executionId}::text
      ON CONFLICT ("executionId", "nodeId") DO UPDATE SET
        "nodeType" = EXCLUDED."nodeType",
        status = EXCLUDED.status,
        input = COALESCE(EXCLUDED.input, workflow_execution_node_results.input),
        output = COALESCE(EXCLUDED.output, workflow_execution_node_results.output),
        error = COALESCE(EXCLUDED.error, workflow_execution_node_results.error),
        "startedAt" = COALESCE(
          workflow_execution_node_results."startedAt",
          EXCLUDED."startedAt"
        ),
        "completedAt" = COALESCE(
          EXCLUDED."completedAt",
          workflow_execution_node_results."completedAt"
        ),
        progress = COALESCE(
          EXCLUDED.progress,
          workflow_execution_node_results.progress
        ),
        "retryCount" = COALESCE(
          EXCLUDED."retryCount",
          workflow_execution_node_results."retryCount"
        ),
        "creditsUsed" = COALESCE(
          EXCLUDED."creditsUsed",
          workflow_execution_node_results."creditsUsed"
        ),
        "updatedAt" = NOW()
      RETURNING "executionId", "nodeId", status
    ),
    -- The statement's own snapshot cannot see the row it just wrote, so
    -- count the execution's other node results plus the upserted row.
    counted AS (
      SELECT
        upserted."executionId",
        COUNT(*) FILTER (
          WHERE node_result.status IN (
            ${SharedWorkflowExecutionStatus.COMPLETED}::text,
            ${SharedWorkflowExecutionStatus.FAILED}::text
          )
        ) AS completed_count,
        COUNT(*) AS result_count
      FROM upserted
      CROSS JOIN LATERAL (
        SELECT other.status
        FROM workflow_execution_node_results AS other
        WHERE other."executionId" = upserted."executionId"
          AND other."nodeId" <> upserted."nodeId"
        UNION ALL
        SELECT upserted.status
      ) AS node_result
      GROUP BY upserted."executionId"
    )
    UPDATE workflow_executions AS execution
    SET
      progress = CASE
        WHEN GREATEST(
          CASE
            WHEN ${useStoredNodeCount}::boolean THEN counted.result_count
            ELSE ${expectedNodeCount}::int
          END,
          COALESCE(execution."totalNodes", 0)
        ) > 0
          THEN ROUND(
            counted.completed_count::numeric * 100 / GREATEST(
              CASE
                WHEN ${useStoredNodeCount}::boolean
                  THEN COALESCE(execution."totalNodes", counted.result_count)
                ELSE ${expectedNodeCount}::int
              END,
              1
            )::numeric
          )::int
        ELSE 0
      END,
      "totalNodes" = COALESCE(
        execution."totalNodes",
        CASE
          WHEN ${useStoredNodeCount}::boolean THEN counted.result_count
          ELSE ${expectedNodeCount}::int
        END
      ),
      "estimatedDurationMs" = COALESCE(
        ${etaColumns.estimatedDurationMs ?? null}::int,
        execution."estimatedDurationMs"
      ),
      "remainingDurationMs" = COALESCE(
        ${etaColumns.remainingDurationMs ?? null}::int,
        execution."remainingDurationMs"
      ),
      "etaConfidence" = COALESCE(
        ${etaColumns.etaConfidence ?? null}::text,
        execution."etaConfidence"
      ),
      "etaCurrentPhase" = COALESCE(
        ${etaColumns.etaCurrentPhase ?? null}::text,
        execution."etaCurrentPhase"
      ),
      "etaUpdatedAt" = COALESCE(
        ${etaColumns.etaUpdatedAt ?? null}::timestamp,
        execution."etaUpdatedAt"
      ),
      "updatedAt" = NOW()
    FROM counted
    WHERE execution.id = counted."executionId"
    RETURNING execution.id, execution.progress
  `;
}
