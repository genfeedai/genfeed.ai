import {
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import type {
  WorkflowExecutionDocument,
  WorkflowNodeResult,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  type ActionOriginContext,
  WorkflowExecutionStatus as SharedWorkflowExecutionStatus,
} from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import {
  normalizeActionOrigin,
  withActionOriginMetadata,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Helpers to safely read/write the `result` JSON column
// ---------------------------------------------------------------------------

function parseResult(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

type WorkflowExecutionResultRow = {
  result: unknown;
};

type WorkflowExecutionResultUpdateRow = WorkflowExecutionResultRow & {
  id: string;
};

type WorkflowExecutionRuntimeStateRow = WorkflowExecutionResultRow & {
  isDeleted: boolean;
  startedAt: Date | null;
};

type WorkflowExecutionCompletionRow = WorkflowExecutionResultRow & {
  startedAt: Date | null;
  workflowId: string;
};

export interface WorkflowExecutionRuntimeState {
  metadata?: Record<string, unknown>;
  progress?: number;
  startedAt: Date | null;
}

/** A workflow execution currently paused at a review gate. */
export interface PendingReviewGateExecution {
  executionId: string;
  workflowId: string;
  organizationId: string;
  nodeId: string;
  requestedAt: string;
  timeoutHours: number;
  autoApproveIfNoResponse: boolean;
}

@Injectable()
export class WorkflowExecutionsService extends BaseService<
  WorkflowExecutionDocument,
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
  ) {
    super(prisma, 'workflowExecution', logger);
  }

  protected override normalizeDocument(
    document: unknown,
  ): WorkflowExecutionDocument {
    const normalized = super.normalizeDocument(
      document,
    ) as WorkflowExecutionDocument;
    if (!normalized || typeof normalized !== 'object') {
      return normalized;
    }

    const result = parseResult(normalized.result);
    const metadata =
      result.metadata &&
      typeof result.metadata === 'object' &&
      !Array.isArray(result.metadata)
        ? { ...(result.metadata as Record<string, unknown>) }
        : {};
    const storedContext: ActionOriginContext = {
      ...(typeof metadata.actorUserId === 'string'
        ? { actorUserId: metadata.actorUserId }
        : {}),
      ...(typeof metadata.apiKeyId === 'string'
        ? { apiKeyId: metadata.apiKeyId }
        : {}),
      origin: normalizeActionOrigin(metadata.origin),
    };
    const normalizedMetadata = withActionOriginMetadata(
      metadata,
      storedContext,
    );

    result.metadata = normalizedMetadata;
    normalized.result = result;
    normalized.metadata = normalizedMetadata;
    return normalized;
  }

  async findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [
      { path: 'workflow', select: 'label description' },
    ],
  ): Promise<WorkflowExecutionDocument | null> {
    return await super.findOne(params, populate);
  }

  @HandleErrors('get execution runtime state', 'workflow-executions')
  async getRuntimeState(
    executionId: string,
  ): Promise<WorkflowExecutionRuntimeState | null> {
    const execution = (await this.prisma.workflowExecution.findUnique({
      select: { isDeleted: true, result: true, startedAt: true },
      where: { id: executionId },
    })) as WorkflowExecutionRuntimeStateRow | null;

    if (!execution || execution.isDeleted) {
      return null;
    }

    const result = parseResult(execution.result);
    const metadata =
      result.metadata && typeof result.metadata === 'object'
        ? (result.metadata as Record<string, unknown>)
        : undefined;

    return {
      metadata,
      progress: typeof result.progress === 'number' ? result.progress : 0,
      startedAt: execution.startedAt,
    };
  }

  /**
   * List executions currently paused at a review gate (a `pendingApproval`
   * lives in the result metadata and the run is still RUNNING). Ordered oldest
   * first so the timeout sweep sees the longest-waiting gates first. The
   * RUNNING set is dominated by paused reviews (active runs are short-lived),
   * so a bounded scan + in-memory metadata parse is both correct and cheap and
   * avoids brittle nested-JSON path operators.
   */
  @HandleErrors('list pending review-gate executions', 'workflow-executions')
  async findPendingReviewGateExecutions(
    limit = 500,
  ): Promise<PendingReviewGateExecution[]> {
    const rows = (await this.prisma.workflowExecution.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        organizationId: true,
        result: true,
        workflowId: true,
      },
      take: limit,
      where: {
        isDeleted: false,
        status: PrismaWorkflowExecutionStatus.RUNNING,
      },
    })) as Array<{
      id: string;
      organizationId: string;
      workflowId: string;
      result: unknown;
    }>;

    const pending: PendingReviewGateExecution[] = [];
    for (const row of rows) {
      const result = parseResult(row.result);
      const metadata =
        result.metadata && typeof result.metadata === 'object'
          ? (result.metadata as Record<string, unknown>)
          : undefined;
      const pendingApproval =
        metadata?.pendingApproval &&
        typeof metadata.pendingApproval === 'object'
          ? (metadata.pendingApproval as Record<string, unknown>)
          : undefined;

      const nodeId = pendingApproval?.nodeId;
      const requestedAt = pendingApproval?.requestedAt;
      if (typeof nodeId !== 'string' || typeof requestedAt !== 'string') {
        continue;
      }

      pending.push({
        autoApproveIfNoResponse:
          typeof pendingApproval?.autoApproveIfNoResponse === 'boolean'
            ? pendingApproval.autoApproveIfNoResponse
            : false,
        executionId: row.id,
        nodeId,
        organizationId: row.organizationId,
        requestedAt,
        timeoutHours:
          typeof pendingApproval?.timeoutHours === 'number'
            ? pendingApproval.timeoutHours
            : 24,
        workflowId: row.workflowId,
      });
    }

    return pending;
  }

  @HandleErrors('create execution', 'workflow-executions')
  async createExecution(
    userId: string,
    organizationId: string,
    dto: CreateWorkflowExecutionDto,
  ): Promise<WorkflowExecutionDocument> {
    const result = await this.prisma.workflowExecution.create({
      data: {
        organizationId,
        result: {
          inputValues: dto.inputValues ?? {},
          metadata: withActionOriginMetadata(dto.metadata),
          nodeResults: [],
          progress: 0,
          trigger: dto.trigger ?? null,
        } as never,
        status: PrismaWorkflowExecutionStatus.PENDING,
        userId,
        workflowId: dto.workflow,
      } as never,
    });

    return this.normalizeDocument(result);
  }

  @HandleErrors('start execution', 'workflow-executions')
  async startExecution(
    executionId: string,
  ): Promise<WorkflowExecutionDocument | null> {
    const result = await this.prisma.workflowExecution.update({
      data: {
        startedAt: new Date(),
        status: PrismaWorkflowExecutionStatus.RUNNING,
      } as never,
      where: { id: executionId },
    });

    return result as unknown as WorkflowExecutionDocument | null;
  }

  @HandleErrors('complete execution', 'workflow-executions')
  async completeExecution(
    executionId: string,
    error?: string,
  ): Promise<WorkflowExecutionDocument | null> {
    const completedAt = new Date();
    const execution = (await this.prisma.workflowExecution.findUnique({
      select: { result: true, startedAt: true, workflowId: true },
      where: { id: executionId },
    })) as WorkflowExecutionCompletionRow | null;

    if (!execution) {
      return null;
    }

    const existingResult = parseResult(execution.result);

    const durationMs = execution.startedAt
      ? completedAt.getTime() - execution.startedAt.getTime()
      : 0;

    const existingMetadata =
      existingResult.metadata && typeof existingResult.metadata === 'object'
        ? { ...(existingResult.metadata as Record<string, unknown>) }
        : {};
    const existingEta =
      existingMetadata.eta &&
      typeof existingMetadata.eta === 'object' &&
      existingMetadata.eta !== null
        ? { ...(existingMetadata.eta as Record<string, unknown>) }
        : {};
    const estimatedDurationMs =
      typeof existingEta.estimatedDurationMs === 'number'
        ? existingEta.estimatedDurationMs
        : undefined;

    if (estimatedDurationMs !== undefined) {
      this.logger?.log('Workflow execution eta comparison', {
        durationDeltaMs: durationMs - estimatedDurationMs,
        estimatedDurationMs,
        executionId,
        observedDurationMs: durationMs,
        workflowId: execution.workflowId,
      });
    }

    const nextMetadata = {
      ...existingMetadata,
      eta: {
        ...existingEta,
        actualDurationMs: durationMs,
        currentPhase: error ? 'Failed' : 'Completed',
        lastEtaUpdateAt: completedAt.toISOString(),
        remainingDurationMs: 0,
      },
    };

    const updatedResult = {
      ...existingResult,
      durationMs,
      metadata: nextMetadata,
      progress: 100,
    };

    const result = await this.prisma.workflowExecution.update({
      data: {
        completedAt,
        error,
        result: updatedResult as never,
        status: error
          ? PrismaWorkflowExecutionStatus.FAILED
          : PrismaWorkflowExecutionStatus.COMPLETED,
      } as never,
      where: { id: executionId },
    });

    return result as unknown as WorkflowExecutionDocument | null;
  }

  @HandleErrors('cancel execution', 'workflow-executions')
  async cancelExecution(
    executionId: string,
  ): Promise<WorkflowExecutionDocument | null> {
    const result = await this.prisma.workflowExecution.update({
      data: {
        completedAt: new Date(),
        status: PrismaWorkflowExecutionStatus.CANCELLED,
      } as never,
      where: { id: executionId },
    });

    return result as unknown as WorkflowExecutionDocument | null;
  }

  @HandleErrors('update node result', 'workflow-executions')
  async updateNodeResult(
    executionId: string,
    nodeResult: WorkflowNodeResult,
    totalNodes?: number,
  ): Promise<WorkflowExecutionDocument | null> {
    const nodeResultJson = JSON.stringify(nodeResult);
    const useStoredNodeCount = totalNodes === undefined;
    const expectedNodeCount = totalNodes ?? 0;

    // sql-risk-audit: ignore raw-sql-review -- Primary-key-scoped single-row JSONB update with bound payloads; removes the redundant result hydration identified by Sentry API-GENFEED-AI-6P.
    const [updatedExecution] = await this.prisma.$queryRaw<
      WorkflowExecutionResultUpdateRow[]
    >`
      WITH current_execution AS (
        SELECT
          id,
          CASE
            WHEN jsonb_typeof(result) = 'object' THEN result
            ELSE '{}'::jsonb
          END AS current_result
        FROM workflow_executions
        WHERE id = ${executionId}
          AND jsonb_typeof(result) IS DISTINCT FROM 'string'
        FOR UPDATE
      ),
      current_node_results AS (
        SELECT
          id,
          current_result,
          CASE
            WHEN jsonb_typeof(current_result->'nodeResults') = 'array'
              THEN current_result->'nodeResults'
            ELSE '[]'::jsonb
          END AS node_results
        FROM current_execution
      ),
      target_node AS (
        SELECT
          id,
          current_result,
          node_results,
          (
            SELECT MIN(ordinal)
            FROM jsonb_array_elements(node_results)
              WITH ORDINALITY AS nodes(existing_node, ordinal)
            WHERE existing_node->>'nodeId' = ${nodeResult.nodeId}
          ) AS target_ordinal
        FROM current_node_results
      ),
      merged_node_results AS (
        SELECT
          id,
          current_result,
          CASE
            WHEN target_ordinal IS NULL
              THEN node_results || jsonb_build_array(${nodeResultJson}::jsonb)
            ELSE (
              SELECT COALESCE(
                jsonb_agg(
                  CASE
                    WHEN ordinal = target_ordinal
                      THEN ${nodeResultJson}::jsonb
                    ELSE existing_node
                  END
                  ORDER BY ordinal
                ),
                '[]'::jsonb
              )
              FROM jsonb_array_elements(node_results)
                WITH ORDINALITY AS nodes(existing_node, ordinal)
            )
          END AS node_results
        FROM target_node
      ),
      next_execution AS (
        SELECT
          id,
          jsonb_set(
            jsonb_set(
              current_result,
              '{nodeResults}',
              node_results,
              true
            ),
            '{progress}',
            to_jsonb(
              CASE
                WHEN (
                  CASE
                    WHEN ${useStoredNodeCount}
                      THEN jsonb_array_length(node_results)
                    ELSE ${expectedNodeCount}
                  END
                ) > 0
                  THEN ROUND(
                    (
                      SELECT COUNT(*)
                      FROM jsonb_array_elements(node_results) AS updated_node
                      WHERE updated_node->>'status' IN (
                        ${SharedWorkflowExecutionStatus.COMPLETED},
                        ${SharedWorkflowExecutionStatus.FAILED}
                      )
                    )::numeric * 100 / (
                      CASE
                        WHEN ${useStoredNodeCount}
                          THEN jsonb_array_length(node_results)
                        ELSE ${expectedNodeCount}
                      END
                    )::numeric
                  )::int
                ELSE 0
              END
            ),
            true
          ) AS result
        FROM merged_node_results
      )
      UPDATE workflow_executions AS execution
      SET
        result = next_execution.result,
        "updatedAt" = NOW()
      FROM next_execution
      WHERE execution.id = next_execution.id
      RETURNING execution.id, execution.result
    `;

    if (updatedExecution) {
      return this.normalizeDocument(
        updatedExecution,
      ) as WorkflowExecutionDocument;
    }

    // Legacy Mongo imports may contain a JSON-encoded string. Preserve the
    // tolerant parser for those rows without keeping that fallback on the hot
    // path for current object-shaped executions.
    const execution = (await this.prisma.workflowExecution.findUnique({
      select: { result: true },
      where: { id: executionId },
    })) as WorkflowExecutionResultRow | null;

    if (!execution) {
      return null;
    }

    const existingResult = parseResult(execution.result);
    const existingNodeResults = Array.isArray(existingResult.nodeResults)
      ? (existingResult.nodeResults as WorkflowNodeResult[])
      : [];

    // Find and update existing node result or add new one
    const existingIndex = existingNodeResults.findIndex(
      (r) => r.nodeId === nodeResult.nodeId,
    );

    const nodeResults = [...existingNodeResults];
    if (existingIndex >= 0) {
      nodeResults[existingIndex] = nodeResult;
    } else {
      nodeResults.push(nodeResult);
    }

    // Calculate overall progress
    const expectedNodes = totalNodes ?? nodeResults.length;
    const completedNodes = nodeResults.filter(
      (r) =>
        r.status === SharedWorkflowExecutionStatus.COMPLETED ||
        r.status === SharedWorkflowExecutionStatus.FAILED,
    ).length;
    const progress =
      expectedNodes > 0
        ? Math.round((completedNodes / expectedNodes) * 100)
        : 0;

    const updatedResult = {
      ...existingResult,
      nodeResults,
      progress,
    };

    const result = await this.prisma.workflowExecution.update({
      data: {
        result: updatedResult as never,
      } as never,
      select: { id: true, result: true },
      where: { id: executionId },
    });

    return this.normalizeDocument(result) as WorkflowExecutionDocument | null;
  }

  private async patchExecutionResult(
    executionId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    const patchJson = JSON.stringify(patch);

    // sql-risk-audit: ignore raw-sql-review -- Primary-key-scoped single-row JSONB merge with a bound payload; current executions take this path while legacy encoded strings retain the tolerant fallback.
    const updated = await this.prisma.$executeRaw`
      UPDATE workflow_executions AS execution
      SET
        result = (
          CASE
            WHEN jsonb_typeof(execution.result) = 'object'
              THEN execution.result
            ELSE '{}'::jsonb
          END
        ) || ${patchJson}::jsonb,
        "updatedAt" = NOW()
      WHERE execution.id = ${executionId}
        AND jsonb_typeof(execution.result) IS DISTINCT FROM 'string'
    `;

    return updated === 1;
  }

  @HandleErrors('set failed node', 'workflow-executions')
  async setFailedNodeId(
    executionId: string,
    failedNodeId: string,
  ): Promise<void> {
    if (
      await this.patchExecutionResult(executionId, {
        failedNodeId,
      })
    ) {
      return;
    }

    const execution = (await this.prisma.workflowExecution.findUnique({
      select: { result: true },
      where: { id: executionId },
    })) as WorkflowExecutionResultRow | null;
    if (!execution) return;

    const existingResult = parseResult(execution.result);

    await this.prisma.workflowExecution.update({
      data: {
        result: { ...existingResult, failedNodeId } as never,
      } as never,
      select: { id: true },
      where: { id: executionId },
    });
  }

  @HandleErrors('set credits used', 'workflow-executions')
  async setCreditsUsed(
    executionId: string,
    creditsUsed: number,
  ): Promise<void> {
    if (
      await this.patchExecutionResult(executionId, {
        creditsUsed,
      })
    ) {
      return;
    }

    const execution = (await this.prisma.workflowExecution.findUnique({
      select: { result: true },
      where: { id: executionId },
    })) as WorkflowExecutionResultRow | null;
    if (!execution) return;

    const existingResult = parseResult(execution.result);

    await this.prisma.workflowExecution.update({
      data: {
        result: { ...existingResult, creditsUsed } as never,
      } as never,
      select: { id: true },
      where: { id: executionId },
    });
  }

  /**
   * Atomically claim the pending review gate for `nodeId`. Both the human
   * approval endpoint and the timeout sweep resolve gates through this claim:
   * the jsonb predicate stops matching once `pendingApproval` is cleared, so
   * exactly one caller wins and the loser sees `false`.
   */
  @HandleErrors('claim pending review gate', 'workflow-executions')
  async claimPendingReviewGate(
    executionId: string,
    nodeId: string,
  ): Promise<boolean> {
    const claimed = await this.prisma.$executeRaw`
      UPDATE workflow_executions
      SET result = jsonb_set(result, '{metadata,pendingApproval}', 'null'::jsonb)
      WHERE id = ${executionId}
        AND status = 'RUNNING'::"WorkflowExecutionStatus"
        AND "completedAt" IS NULL
        AND result -> 'metadata' -> 'pendingApproval' ->> 'nodeId' = ${nodeId}
    `;
    return claimed === 1;
  }

  @HandleErrors('update execution metadata', 'workflow-executions')
  async updateExecutionMetadata(
    executionId: string,
    metadataUpdates: Record<string, unknown>,
  ): Promise<WorkflowExecutionDocument | null> {
    const metadataUpdatesJson = JSON.stringify(metadataUpdates);

    // sql-risk-audit: ignore raw-sql-review -- Primary-key-scoped single-row JSONB merge with a bound payload; avoids re-reading the growing execution result for every ETA update.
    const [updatedExecution] = await this.prisma.$queryRaw<
      WorkflowExecutionResultUpdateRow[]
    >`
      UPDATE workflow_executions AS execution
      SET
        result = jsonb_set(
          CASE
            WHEN jsonb_typeof(execution.result) = 'object'
              THEN execution.result
            ELSE '{}'::jsonb
          END,
          '{metadata}',
          COALESCE(
            CASE
              WHEN jsonb_typeof(execution.result->'metadata') = 'object'
                THEN execution.result->'metadata'
            END,
            '{}'::jsonb
          ) || ${metadataUpdatesJson}::jsonb,
          true
        ),
        "updatedAt" = NOW()
      WHERE execution.id = ${executionId}
        AND jsonb_typeof(execution.result) IS DISTINCT FROM 'string'
      RETURNING execution.id, execution.result
    `;

    if (updatedExecution) {
      return this.normalizeDocument(
        updatedExecution,
      ) as WorkflowExecutionDocument;
    }

    // Keep tolerant handling for legacy JSON-encoded string rows off the
    // current execution path while preserving their existing merge behavior.
    const execution = (await this.prisma.workflowExecution.findUnique({
      select: { result: true },
      where: { id: executionId },
    })) as WorkflowExecutionResultRow | null;

    if (!execution) {
      return null;
    }

    const existingResult = parseResult(execution.result);
    const existingMetadata =
      existingResult.metadata && typeof existingResult.metadata === 'object'
        ? (existingResult.metadata as Record<string, unknown>)
        : {};

    const updatedResult = {
      ...existingResult,
      metadata: {
        ...existingMetadata,
        ...metadataUpdates,
      },
    };

    const result = await this.prisma.workflowExecution.update({
      data: {
        result: updatedResult as never,
      } as never,
      select: { id: true, result: true },
      where: { id: executionId },
    });

    return this.normalizeDocument(result) as WorkflowExecutionDocument | null;
  }

  @HandleErrors('get execution stats', 'workflow-executions')
  async getExecutionStats(
    workflowId: string,
    organizationId: string,
  ): Promise<{
    total: number;
    completed: number;
    failed: number;
    avgDurationMs: number;
  }> {
    // Fetch result JSON alongside status so we can read durationMs from it
    const executions = await this.prisma.workflowExecution.findMany({
      select: { result: true, status: true },
      where: { isDeleted: false, organizationId, workflowId },
    });

    const typed = executions as unknown as Array<{
      result?: unknown;
      status: string;
    }>;

    const total = typed.length;
    const completed = typed.filter(
      (e) => e.status === PrismaWorkflowExecutionStatus.COMPLETED,
    ).length;
    const failed = typed.filter(
      (e) => e.status === PrismaWorkflowExecutionStatus.FAILED,
    ).length;

    const durationsWithValue = typed
      .map((e) => {
        const r = parseResult(e.result);
        return typeof r.durationMs === 'number' ? r.durationMs : undefined;
      })
      .filter((d): d is number => typeof d === 'number' && d > 0);

    const avgDurationMs =
      durationsWithValue.length > 0
        ? durationsWithValue.reduce((a, b) => a + b, 0) /
          durationsWithValue.length
        : 0;

    return { avgDurationMs, completed, failed, total };
  }
}
