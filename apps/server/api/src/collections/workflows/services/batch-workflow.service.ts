import type { BatchWorkflowJobDocument } from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import {
  type BatchWorkflowItemOutputSummary,
  BatchWorkflowItemStatus,
  BatchWorkflowJobStatus,
} from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateBatchJobInput {
  workflowId: string;
  ingredientIds: string[];
  userId: string;
  organizationId: string;
}

export interface BatchWorkflowItemCompletionInput {
  executionId?: string;
  outputIngredientId?: string;
  outputCategory?: string;
  outputSummary?: BatchWorkflowItemOutputSummary;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class BatchWorkflowService {
  private readonly logContext = 'BatchWorkflowService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create a new batch workflow job with items for each ingredient.
   */
  async createBatchJob(
    input: CreateBatchJobInput,
  ): Promise<BatchWorkflowJobDocument> {
    const { workflowId, ingredientIds, userId, organizationId } = input;

    if (!ingredientIds.length) {
      throw new BadRequestException('At least one ingredientId is required');
    }

    if (ingredientIds.length > 100) {
      throw new BadRequestException('Maximum 100 items per batch');
    }

    const items = ingredientIds.map((id) => ({
      ingredientId: id,
      status: BatchWorkflowItemStatus.PENDING,
    }));

    const job = await this.prisma.batchWorkflowJob.create({
      data: {
        completedCount: 0,
        failedCount: 0,
        items: items as never,
        organizationId,
        status: BatchWorkflowJobStatus.PENDING,
        totalCount: ingredientIds.length,
        userId,
        workflowId,
      } as never,
    });

    this.logger.log(`${this.logContext} created batch job`, {
      batchJobId: job.id,
      itemCount: ingredientIds.length,
      workflowId,
    });

    return job as unknown as BatchWorkflowJobDocument;
  }

  /**
   * Get a batch job by ID.
   */
  async getBatchJob(batchJobId: string): Promise<BatchWorkflowJobDocument> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) {
      throw new NotFoundException(`Batch job ${batchJobId} not found`);
    }
    return job as unknown as BatchWorkflowJobDocument;
  }

  /**
   * Get a batch job by ID, scoped to organization.
   */
  async getBatchJobForOrg(
    batchJobId: string,
    organizationId: string,
  ): Promise<BatchWorkflowJobDocument> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId, organizationId },
    });

    if (!job) {
      throw new NotFoundException(`Batch job ${batchJobId} not found`);
    }
    return job as unknown as BatchWorkflowJobDocument;
  }

  /**
   * List batch jobs for an organization.
   */
  async listBatchJobs(
    organizationId: string,
    limit = 20,
    offset = 0,
  ): Promise<BatchWorkflowJobDocument[]> {
    const jobs = await this.prisma.batchWorkflowJob.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      where: { organizationId },
    });
    return jobs as unknown as BatchWorkflowJobDocument[];
  }

  /**
   * Mark the batch job as processing.
   */
  async markProcessing(batchJobId: string): Promise<void> {
    await this.prisma.batchWorkflowJob.update({
      data: { status: BatchWorkflowJobStatus.PROCESSING } as never,
      where: { id: batchJobId },
    });
  }

  /**
   * Mark an individual item as processing.
   * Reads the current items array, updates the matching item in-memory, writes back.
   */
  async markItemProcessing(batchJobId: string, itemId: string): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const jobDoc = job as unknown as Record<string, unknown>;
    const items = (jobDoc.items as Array<Record<string, unknown>>) ?? [];
    const updatedItems = items.map((item) =>
      item.id === itemId || item._id?.toString() === itemId
        ? {
            ...item,
            startedAt: new Date(),
            status: BatchWorkflowItemStatus.PROCESSING,
          }
        : item,
    );

    await this.prisma.batchWorkflowJob.update({
      data: { items: updatedItems as never } as never,
      where: { id: batchJobId },
    });
  }

  /**
   * Mark an individual item as completed.
   */
  async markItemCompleted(
    batchJobId: string,
    itemId: string,
    completion: BatchWorkflowItemCompletionInput = {},
  ): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const jobDoc = job as unknown as Record<string, unknown>;
    const items = (jobDoc.items as Array<Record<string, unknown>>) ?? [];
    const updatedItems = items.map((item) => {
      if (item.id !== itemId && item._id?.toString() !== itemId) return item;
      return {
        ...item,
        completedAt: new Date(),
        ...(completion.executionId
          ? { executionId: completion.executionId }
          : {}),
        ...(completion.outputIngredientId
          ? { outputIngredientId: completion.outputIngredientId }
          : {}),
        ...(completion.outputCategory
          ? { outputCategory: completion.outputCategory }
          : {}),
        ...(completion.outputSummary
          ? { outputSummary: completion.outputSummary }
          : {}),
        status: BatchWorkflowItemStatus.COMPLETED,
      };
    });

    await this.prisma.batchWorkflowJob.update({
      data: {
        completedCount: { increment: 1 },
        items: updatedItems as never,
      } as never,
      where: { id: batchJobId },
    });

    await this.checkAndFinalizeJob(batchJobId);
  }

  /**
   * Mark an individual item as failed.
   */
  async markItemFailed(
    batchJobId: string,
    itemId: string,
    error: string,
  ): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const jobDoc = job as unknown as Record<string, unknown>;
    const items = (jobDoc.items as Array<Record<string, unknown>>) ?? [];
    const updatedItems = items.map((item) =>
      item.id === itemId || item._id?.toString() === itemId
        ? {
            ...item,
            completedAt: new Date(),
            error,
            status: BatchWorkflowItemStatus.FAILED,
          }
        : item,
    );

    await this.prisma.batchWorkflowJob.update({
      data: {
        failedCount: { increment: 1 },
        items: updatedItems as never,
      } as never,
      where: { id: batchJobId },
    });

    await this.checkAndFinalizeJob(batchJobId);
  }

  /**
   * Check if all items are done and finalize the job status.
   */
  private async checkAndFinalizeJob(batchJobId: string): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const jobDoc = job as unknown as Record<string, unknown>;
    const completedCount = (jobDoc.completedCount as number) ?? 0;
    const failedCount = (jobDoc.failedCount as number) ?? 0;
    const totalCount = (jobDoc.totalCount as number) ?? 0;

    const processed = completedCount + failedCount;
    if (processed >= totalCount) {
      const finalStatus =
        failedCount > 0 && completedCount === 0
          ? BatchWorkflowJobStatus.FAILED
          : BatchWorkflowJobStatus.COMPLETED;

      await this.prisma.batchWorkflowJob.update({
        data: { status: finalStatus } as never,
        where: { id: batchJobId },
      });

      this.logger.log(`${this.logContext} batch job finalized`, {
        batchJobId,
        completedCount,
        failedCount,
        status: finalStatus,
      });
    }
  }
}
