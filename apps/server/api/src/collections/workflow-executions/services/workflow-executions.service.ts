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
import { WorkflowExecutionStatus as SharedWorkflowExecutionStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
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
          metadata: dto.metadata ?? {},
          nodeResults: [],
          progress: 0,
          trigger: dto.trigger ?? null,
        } as never,
        status: PrismaWorkflowExecutionStatus.PENDING,
        userId,
        workflowId: dto.workflow,
      } as never,
    });

    return result as unknown as WorkflowExecutionDocument;
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

  @HandleErrors('set failed node', 'workflow-executions')
  async setFailedNodeId(
    executionId: string,
    failedNodeId: string,
  ): Promise<void> {
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
