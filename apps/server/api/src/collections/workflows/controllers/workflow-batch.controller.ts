import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BatchWorkflowService } from '@api/collections/workflows/services/batch-workflow.service';
import { BatchWorkflowQueueService } from '@api/collections/workflows/services/batch-workflow-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import type {
  BatchWorkflowStatusResponse,
  BatchWorkflowSummary,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

/**
 * Batch workflow status + execution endpoints. Declared (and module-registered)
 * before the CRUD controller so the literal `batch` / `batch/:batchJobId`
 * routes win over `:workflowId`. Split out of the former monolithic
 * `WorkflowsController`.
 */
@AutoSwagger()
@Controller('workflows')
export class WorkflowBatchController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly batchWorkflowService: BatchWorkflowService,
    private readonly batchWorkflowQueueService: BatchWorkflowQueueService,
    readonly _loggerService: LoggerService,
  ) {}

  private normalizeCount(value: number | null | undefined): number {
    return typeof value === 'number' ? value : 0;
  }

  private getBatchItemId(item: {
    id?: string | { toString(): string };
    ingredientId: string | { toString(): string };
  }): string {
    if (typeof item.id === 'string') {
      return item.id;
    }

    if (item.id && typeof item.id.toString === 'function') {
      return item.id.toString();
    }

    return item.ingredientId.toString();
  }

  @Get('batch/:batchJobId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getBatchStatus(
    @Param('batchJobId') batchJobId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: BatchWorkflowStatusResponse }> {
    const publicMetadata = getPublicMetadata(user);

    const job = await this.batchWorkflowService.getBatchJobForOrg(
      batchJobId,
      publicMetadata.organization,
    );

    return {
      data: {
        _id: job.id.toString(),
        completedCount: this.normalizeCount(job.completedCount),
        createdAt: job.createdAt?.toISOString(),
        failedCount: this.normalizeCount(job.failedCount),
        items: job.items.map((item) => ({
          _id: this.getBatchItemId(item),
          completedAt: item.completedAt?.toISOString(),
          error: item.error,
          executionId: item.executionId,
          ingredientId: item.ingredientId.toString(),
          outputCategory: item.outputCategory,
          outputIngredientId: item.outputIngredientId?.toString(),
          outputSummary:
            item.outputSummary &&
            typeof item.outputSummary.id === 'string' &&
            typeof item.outputSummary.category === 'string'
              ? {
                  category: item.outputSummary.category,
                  id: item.outputSummary.id,
                  ingredientUrl: item.outputSummary.ingredientUrl,
                  status: item.outputSummary.status,
                  thumbnailUrl: item.outputSummary.thumbnailUrl,
                }
              : undefined,
          startedAt: item.startedAt?.toISOString(),
          status: item.status,
        })),
        status: job.status,
        totalCount: this.normalizeCount(job.totalCount),
        updatedAt: job.updatedAt?.toISOString(),
        workflowId: job.workflowId.toString(),
      },
    };
  }

  @Get('batch')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async listBatchJobs(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: BatchWorkflowSummary[] }> {
    const publicMetadata = getPublicMetadata(user);
    const jobs = await this.batchWorkflowService.listBatchJobs(
      publicMetadata.organization,
      limit ? Number.parseInt(limit, 10) : 20,
      offset ? Number.parseInt(offset, 10) : 0,
    );

    return {
      data: jobs.map((job) => ({
        _id: job.id.toString(),
        completedCount: this.normalizeCount(job.completedCount),
        createdAt: job.createdAt?.toISOString(),
        failedCount: this.normalizeCount(job.failedCount),
        status: job.status,
        totalCount: this.normalizeCount(job.totalCount),
        workflowId: job.workflowId.toString(),
      })),
    };
  }

  @Post(':workflowId/batch')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async runBatch(
    @Param('workflowId') workflowId: string,
    @Body() body: { ingredientIds: string[] },
    @CurrentUser() user: User,
  ): Promise<{ data: { batchJobId: string; totalCount: number } }> {
    const publicMetadata = getPublicMetadata(user);

    // Validate workflow exists and belongs to org
    await this.workflowsService.findOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
    });

    if (!body.ingredientIds?.length) {
      throw new HttpException(
        'At least one ingredientId is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Create the batch job
    const batchJob = await this.batchWorkflowService.createBatchJob({
      ingredientIds: body.ingredientIds,
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
      workflowId,
    });

    // Mark as processing
    await this.batchWorkflowService.markProcessing(batchJob.id.toString());

    // Enqueue all items
    const itemJobs = batchJob.items.map((item) => ({
      batchJobId: batchJob.id.toString(),
      ingredientId: item.ingredientId.toString(),
      itemId: this.getBatchItemId(item),
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
      workflowId,
    }));

    await this.batchWorkflowQueueService.enqueueBatchItems(itemJobs);

    return {
      data: {
        batchJobId: batchJob.id.toString(),
        totalCount: this.normalizeCount(batchJob.totalCount),
      },
    };
  }
}
