import { UsersService } from '@api/collections/users/services/users.service';
import {
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto,
} from '@api/collections/workflow-executions/dto/create-workflow-execution.dto';
import {
  WorkflowExecution,
  type WorkflowExecutionDocument,
  WorkflowNodeResult,
} from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class WorkflowExecutionsService extends BaseService<
  WorkflowExecutionDocument,
  CreateWorkflowExecutionDto,
  UpdateWorkflowExecutionDto
> {
  constructor(
    @InjectModel(WorkflowExecution.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<WorkflowExecutionDocument>,
    logger: LoggerService,
    @Optional() private readonly usersService?: UsersService,
  ) {
    super(model, logger);
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
    return await this.create({
      ...dto,
      // @ts-expect-error nodeResults valid
      nodeResults: [],
      organization: new Types.ObjectId(organizationId),
      progress: 0,
      status: WorkflowExecutionStatus.PENDING,
      user: new Types.ObjectId(userId),
    });
  }

  @HandleErrors('start execution', 'workflow-executions')
  async startExecution(
    executionId: string,
  ): Promise<WorkflowExecutionDocument | null> {
    return await this.model.findByIdAndUpdate(
      executionId,
      {
        startedAt: new Date(),
        status: WorkflowExecutionStatus.RUNNING,
      },
      { returnDocument: 'after' },
    );
  }

  @HandleErrors('complete execution', 'workflow-executions')
  async completeExecution(
    executionId: string,
    error?: string,
  ): Promise<WorkflowExecutionDocument | null> {
    const completedAt = new Date();
    const execution = await this.model.findById(executionId);

    if (!execution) {
      return null;
    }

    const durationMs = execution.startedAt
      ? completedAt.getTime() - execution.startedAt.getTime()
      : 0;
    const existingMetadata =
      execution.metadata && typeof execution.metadata === 'object'
        ? { ...execution.metadata }
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
        workflowId: execution.workflow?.toString(),
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

    return await this.model.findByIdAndUpdate(
      executionId,
      {
        completedAt,
        durationMs,
        error,
        metadata: nextMetadata,
        progress: 100,
        status: error
          ? WorkflowExecutionStatus.FAILED
          : WorkflowExecutionStatus.COMPLETED,
      },
      { returnDocument: 'after' },
    );
  }

  @HandleErrors('cancel execution', 'workflow-executions')
  async cancelExecution(
    executionId: string,
  ): Promise<WorkflowExecutionDocument | null> {
    return await this.model.findByIdAndUpdate(
      executionId,
      {
        completedAt: new Date(),
        status: WorkflowExecutionStatus.CANCELLED,
      },
      { returnDocument: 'after' },
    );
  }

  @HandleErrors('update node result', 'workflow-executions')
  async updateNodeResult(
    executionId: string,
    nodeResult: WorkflowNodeResult,
    totalNodes?: number,
  ): Promise<WorkflowExecutionDocument | null> {
    const execution = await this.model.findById(executionId);
    if (!execution) {
      return null;
    }

    // Find and update existing node result or add new one
    const existingIndex = execution.nodeResults.findIndex(
      (r) => r.nodeId === nodeResult.nodeId,
    );

    if (existingIndex >= 0) {
      execution.nodeResults[existingIndex] = nodeResult;
    } else {
      execution.nodeResults.push(nodeResult);
    }

    // Calculate overall progress based on node completion
    // Use provided totalNodes (from workflow definition) to avoid oscillating progress
    // Fallback to nodeResults.length only if totalNodes not provided
    const expectedNodes = totalNodes ?? execution.nodeResults.length;
    const completedNodes = execution.nodeResults.filter(
      (r) =>
        r.status === WorkflowExecutionStatus.COMPLETED ||
        r.status === WorkflowExecutionStatus.FAILED,
    ).length;
    const progress =
      expectedNodes > 0
        ? Math.round((completedNodes / expectedNodes) * 100)
        : 0;

    execution.progress = progress;
    return await execution.save();
  }

  @HandleErrors('set failed node', 'workflow-executions')
  async setFailedNodeId(
    executionId: string,
    failedNodeId: string,
  ): Promise<void> {
    await this.model.updateOne(
      { _id: executionId },
      { $set: { failedNodeId } },
    );
  }

  @HandleErrors('set credits used', 'workflow-executions')
  async setCreditsUsed(
    executionId: string,
    creditsUsed: number,
  ): Promise<void> {
    await this.model.updateOne({ _id: executionId }, { $set: { creditsUsed } });
  }

  @HandleErrors('update execution metadata', 'workflow-executions')
  async updateExecutionMetadata(
    executionId: string,
    metadataUpdates: Record<string, unknown>,
  ): Promise<WorkflowExecutionDocument | null> {
    const execution = await this.model.findById(executionId);
    if (!execution) {
      return null;
    }

    execution.metadata = {
      ...(execution.metadata ?? {}),
      ...metadataUpdates,
    };

    return await execution.save();
  }

  @HandleErrors('get workflow executions', 'workflow-executions')
  async getWorkflowExecutions(
    workflowId: string,
    organizationId: string,
    limit = 20,
    offset = 0,
  ): Promise<WorkflowExecutionDocument[]> {
    const executions = await this.model
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        workflow: new Types.ObjectId(workflowId),
      })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec();

    // Application-level join for user (lives in auth DB)
    if (executions.length > 0 && this.usersService) {
      const userIds = [
        ...new Set(executions.map((e) => e.user?.toString()).filter(Boolean)),
      ];

      if (userIds.length > 0) {
        const usersResult = await this.usersService.findAll(
          [
            {
              $match: {
                _id: {
                  $in: userIds.map((id) => new Types.ObjectId(id)),
                },
              },
            },
            {
              $project: {
                _id: 1,
                email: 1,
                firstName: 1,
                lastName: 1,
              },
            },
          ],
          { pagination: false },
        );

        const usersMap = new Map(
          usersResult.docs.map((u: { _id: { toString(): string } }) => [
            u._id.toString(),
            u,
          ]),
        );

        for (const execution of executions) {
          const userId = execution.user?.toString();
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
    const stats = await this.model.aggregate([
      {
        $match: {
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
          workflow: new Types.ObjectId(workflowId),
        },
      },
      {
        $group: {
          _id: null,
          avgDurationMs: {
            $avg: {
              $cond: [{ $gt: ['$durationMs', 0] }, '$durationMs', null],
            },
          },
          completed: {
            $sum: {
              $cond: [
                { $eq: ['$status', WorkflowExecutionStatus.COMPLETED] },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: {
              $cond: [
                { $eq: ['$status', WorkflowExecutionStatus.FAILED] },
                1,
                0,
              ],
            },
          },
          total: { $sum: 1 },
        },
      },
    ]);

    return stats[0] || { avgDurationMs: 0, completed: 0, failed: 0, total: 0 };
  }
}
