import {
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import type {
  WorkflowExecutionDocument,
  WorkflowNodeResult,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { WorkflowEventWebhookService } from '@api/services/webhook-client/workflow-event-webhook.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  type ActionOriginContext,
  WorkflowExecutionStatus as SharedWorkflowExecutionStatus,
} from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import {
  Prisma,
  WorkflowExecutionStatus as PrismaWorkflowExecutionStatus,
} from '@genfeedai/prisma';
import {
  normalizeActionOrigin,
  scopedWhere,
  withActionOriginMetadata,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

function readRecord(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

function readNodeResults(raw: unknown): WorkflowNodeResult[] {
  return Array.isArray(raw)
    ? raw.filter(
        (item): item is WorkflowNodeResult =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

type WorkflowExecutionResultRow = {
  result: unknown;
};

type WorkflowExecutionResultUpdateRow = WorkflowExecutionResultRow & {
  id: string;
};

type WorkflowExecutionResultSnapshot = {
  id: string;
  metadata: Record<string, unknown>;
  nodeResults: WorkflowNodeResult[];
  progress: number;
  result: Record<string, unknown>;
};

function normalizeResultSnapshot(
  row: WorkflowExecutionResultUpdateRow,
): WorkflowExecutionResultSnapshot {
  const result = readRecord(row.result);
  return {
    id: row.id,
    metadata: readRecord(result.metadata),
    nodeResults: readNodeResults(result.nodeResults),
    progress: typeof result.progress === 'number' ? result.progress : 0,
    result,
  };
}

type WorkflowExecutionRuntimeStateRow = WorkflowExecutionResultRow & {
  isDeleted: boolean;
  startedAt: Date | null;
};

type WorkflowExecutionCompletionRow = WorkflowExecutionResultRow & {
  organizationId: string | null;
  startedAt: Date | null;
  trigger: string | null;
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
    private readonly workflowEventWebhookService: WorkflowEventWebhookService,
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

    const result = readRecord(normalized.result);
    const metadata = readRecord(result.metadata);
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

    return {
      ...normalized,
      creditsUsed:
        typeof result.creditsUsed === 'number' ? result.creditsUsed : undefined,
      durationMs:
        typeof result.durationMs === 'number' ? result.durationMs : undefined,
      failedNodeId:
        typeof result.failedNodeId === 'string' ? result.failedNodeId : null,
      inputValues: readRecord(result.inputValues),
      metadata: normalizedMetadata,
      nodeResults: readNodeResults(result.nodeResults),
      progress: typeof result.progress === 'number' ? result.progress : 0,
      result: { ...result, metadata: normalizedMetadata },
    };
  }

  async findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [
      { path: 'workflow', select: ['label', 'description'] },
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

    const result = readRecord(execution.result);
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
      const result = readRecord(row.result);
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
    const executionResult = {
      inputValues: dto.inputValues ?? {},
      metadata: withActionOriginMetadata(dto.metadata),
      nodeResults: [],
      progress: 0,
    } as Prisma.InputJsonValue;
    const data = {
      organizationId,
      result: executionResult,
      status: PrismaWorkflowExecutionStatus.PENDING,
      trigger: dto.trigger ?? null,
      userId,
      workflowId: dto.workflowId,
    } satisfies Prisma.WorkflowExecutionUncheckedCreateInput;

    const result = await this.prisma.workflowExecution.create({
      data,
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
      },
      where: { id: executionId },
    });

    return this.normalizeDocument(result);
  }

  @HandleErrors('complete execution', 'workflow-executions')
  async completeExecution(
    executionId: string,
    error?: string,
  ): Promise<WorkflowExecutionDocument | null> {
    const completedAt = new Date();
    const execution = (await this.prisma.workflowExecution.findUnique({
      select: {
        organizationId: true,
        result: true,
        startedAt: true,
        trigger: true,
        workflowId: true,
      },
      where: { id: executionId },
    })) as WorkflowExecutionCompletionRow | null;

    if (!execution) {
      return null;
    }

    const existingResult = readRecord(execution.result);

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
    // Runner-written completion fields ride on the untyped result record.
    const completionOutcome = existingResult as {
      creditsUsed?: unknown;
      failedNodeId?: unknown;
    };

    const result = await this.prisma.workflowExecution.update({
      data: {
        completedAt,
        error,
        result: updatedResult as Prisma.InputJsonValue,
        status: error
          ? PrismaWorkflowExecutionStatus.FAILED
          : PrismaWorkflowExecutionStatus.COMPLETED,
      },
      where: { id: executionId },
    });

    const document = this.normalizeDocument(result);

    // Terminal transitions funnel through here, so this is the only place an
    // outbound `workflow.execution.*` event has to be emitted from.
    await this.workflowEventWebhookService.emitExecutionOutcome({
      completedAt,
      creditsUsed:
        typeof completionOutcome.creditsUsed === 'number'
          ? completionOutcome.creditsUsed
          : 0,
      durationMs,
      errorMessage: error ?? null,
      executionId,
      failedNodeId:
        typeof completionOutcome.failedNodeId === 'string'
          ? completionOutcome.failedNodeId
          : null,
      occurredAt: completedAt,
      organizationId: execution.organizationId ?? '',
      progress: 100,
      startedAt: execution.startedAt,
      status: error
        ? SharedWorkflowExecutionStatus.FAILED
        : SharedWorkflowExecutionStatus.COMPLETED,
      trigger: execution.trigger,
      workflowId: execution.workflowId,
    });

    return document;
  }

  @HandleErrors('cancel execution', 'workflow-executions')
  async cancelExecution(
    executionId: string,
  ): Promise<WorkflowExecutionDocument | null> {
    const result = await this.prisma.workflowExecution.update({
      data: {
        completedAt: new Date(),
        status: PrismaWorkflowExecutionStatus.CANCELLED,
      },
      where: { id: executionId },
    });

    return this.normalizeDocument(result);
  }

  @HandleErrors('update node result', 'workflow-executions')
  async updateNodeResult(
    executionId: string,
    nodeResult: WorkflowNodeResult,
    totalNodes?: number,
  ): Promise<WorkflowExecutionResultSnapshot | null> {
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
      return normalizeResultSnapshot(updatedExecution);
    }

    return null;
  }

  private async patchExecutionResult(
    executionId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const patchJson = JSON.stringify(patch);

    // sql-risk-audit: ignore raw-sql-review -- Primary-key-scoped single-row JSONB merge with a bound payload.
    await this.prisma.$executeRaw`
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
    `;
  }

  @HandleErrors('set failed node', 'workflow-executions')
  async setFailedNodeId(
    executionId: string,
    failedNodeId: string,
  ): Promise<void> {
    await this.patchExecutionResult(executionId, {
      failedNodeId,
    });
  }

  @HandleErrors('set credits used', 'workflow-executions')
  async setCreditsUsed(
    executionId: string,
    creditsUsed: number,
  ): Promise<void> {
    await this.patchExecutionResult(executionId, {
      creditsUsed,
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
  ): Promise<WorkflowExecutionResultSnapshot | null> {
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
      RETURNING execution.id, execution.result
    `;

    if (updatedExecution) {
      return normalizeResultSnapshot(updatedExecution);
    }

    return null;
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
      where: scopedWhere(organizationId, { workflowId }),
    });

    const total = executions.length;
    const completed = executions.filter(
      (e) => e.status === PrismaWorkflowExecutionStatus.COMPLETED,
    ).length;
    const failed = executions.filter(
      (e) => e.status === PrismaWorkflowExecutionStatus.FAILED,
    ).length;

    const durationsWithValue = executions
      .map((e) => {
        const r = readRecord(e.result);
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
