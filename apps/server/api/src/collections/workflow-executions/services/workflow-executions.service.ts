import { UsersService } from '@api/collections/users/services/users.service';
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
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class WorkflowExecutionsService extends BaseService<
  WorkflowExecutionDocument,
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
    @Optional() private readonly usersService?: UsersService,
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

  @HandleErrors('create execution', 'workflow-executions')
  async createExecution(
    userId: string,
    organizationId: string,
    dto: CreateWorkflowExecutionDto,
  ): Promise<WorkflowExecutionDocument> {
    const result = await this.prisma.workflowExecution.create({
      data: {
        ...dto,
        nodeResults: [],
        organizationId,
        progress: 0,
        status: WorkflowExecutionStatus.PENDING,
        userId,
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
        status: WorkflowExecutionStatus.RUNNING,
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
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId },
    });

    if (!execution) {
      return null;
    }

    const execDoc = execution as unknown as Record<string, unknown>;
    const durationMs = (execDoc.startedAt as Date)
      ? completedAt.getTime() - (execDoc.startedAt as Date).getTime()
      : 0;

    const existingMetadata =
      execDoc.metadata && typeof execDoc.metadata === 'object'
        ? { ...(execDoc.metadata as Record<string, unknown>) }
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
        workflowId: execDoc.workflowId?.toString(),
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

    const result = await this.prisma.workflowExecution.update({
      data: {
        completedAt,
        durationMs,
        error,
        metadata: nextMetadata,
        progress: 100,
        status: error
          ? WorkflowExecutionStatus.FAILED
          : WorkflowExecutionStatus.COMPLETED,
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
        status: WorkflowExecutionStatus.CANCELLED,
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
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId },
    });

    if (!execution) {
      return null;
    }

    const execDoc = execution as unknown as {
      nodeResults: WorkflowNodeResult[];
      progress: number;
    };

    // Find and update existing node result or add new one
    const existingIndex = execDoc.nodeResults.findIndex(
      (r) => r.nodeId === nodeResult.nodeId,
    );

    const nodeResults = [...execDoc.nodeResults];
    if (existingIndex >= 0) {
      nodeResults[existingIndex] = nodeResult;
    } else {
      nodeResults.push(nodeResult);
    }

    // Calculate overall progress
    const expectedNodes = totalNodes ?? nodeResults.length;
    const completedNodes = nodeResults.filter(
      (r) =>
        r.status === WorkflowExecutionStatus.COMPLETED ||
        r.status === WorkflowExecutionStatus.FAILED,
    ).length;
    const progress =
      expectedNodes > 0
        ? Math.round((completedNodes / expectedNodes) * 100)
        : 0;

    const result = await this.prisma.workflowExecution.update({
      data: {
        nodeResults: nodeResults as never,
        progress,
      } as never,
      where: { id: executionId },
    });

    return result as unknown as WorkflowExecutionDocument | null;
  }

  @HandleErrors('set failed node', 'workflow-executions')
  async setFailedNodeId(
    executionId: string,
    failedNodeId: string,
  ): Promise<void> {
    await this.prisma.workflowExecution.update({
      data: { failedNodeId } as never,
      where: { id: executionId },
    });
  }

  @HandleErrors('set credits used', 'workflow-executions')
  async setCreditsUsed(
    executionId: string,
    creditsUsed: number,
  ): Promise<void> {
    await this.prisma.workflowExecution.update({
      data: { creditsUsed } as never,
      where: { id: executionId },
    });
  }

  @HandleErrors('update execution metadata', 'workflow-executions')
  async updateExecutionMetadata(
    executionId: string,
    metadataUpdates: Record<string, unknown>,
  ): Promise<WorkflowExecutionDocument | null> {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId },
    });

    if (!execution) {
      return null;
    }

    const existingMetadata =
      (execution as unknown as Record<string, unknown>).metadata ?? {};

    const result = await this.prisma.workflowExecution.update({
      data: {
        metadata: {
          ...(existingMetadata as Record<string, unknown>),
          ...metadataUpdates,
        },
      } as never,
      where: { id: executionId },
    });

    return result as unknown as WorkflowExecutionDocument | null;
  }

  @HandleErrors('get workflow executions', 'workflow-executions')
  async getWorkflowExecutions(
    workflowId: string,
    organizationId: string,
    limit = 20,
    offset = 0,
  ): Promise<WorkflowExecutionDocument[]> {
    const executions = await this.prisma.workflowExecution.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      where: {
        isDeleted: false,
        organizationId,
        workflowId,
      },
    });

    // Application-level join for user (lives in auth DB)
    if (executions.length > 0 && this.usersService) {
      const userIds = [
        ...new Set(
          executions
            .map(
              (e) => (e as unknown as Record<string, unknown>).userId as string,
            )
            .filter(Boolean),
        ),
      ];

      if (userIds.length > 0) {
        // Fetch users individually since usersService.findAll uses Mongoose aggregation
        const usersMap = new Map<string, unknown>();
        for (const userId of userIds) {
          const user = await this.usersService.findOne({ _id: userId }, []);
          if (user) {
            usersMap.set(userId, user);
          }
        }

        for (const execution of executions) {
          const userId = (execution as unknown as Record<string, unknown>)
            .userId as string;
          if (userId && usersMap.has(userId)) {
            (execution as unknown as Record<string, unknown>).user =
              usersMap.get(userId);
          }
        }
      }
    }

    return executions as unknown as WorkflowExecutionDocument[];
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
    const executions = await this.prisma.workflowExecution.findMany({
      select: { durationMs: true, status: true },
      where: { isDeleted: false, organizationId, workflowId },
    });

    const typed = executions as unknown as Array<{
      durationMs?: number;
      status: string;
    }>;

    const total = typed.length;
    const completed = typed.filter(
      (e) => e.status === WorkflowExecutionStatus.COMPLETED,
    ).length;
    const failed = typed.filter(
      (e) => e.status === WorkflowExecutionStatus.FAILED,
    ).length;

    const durationsWithValue = typed
      .map((e) => e.durationMs)
      .filter((d): d is number => typeof d === 'number' && d > 0);

    const avgDurationMs =
      durationsWithValue.length > 0
        ? durationsWithValue.reduce((a, b) => a + b, 0) /
          durationsWithValue.length
        : 0;

    return { avgDurationMs, completed, failed, total };
  }
}
