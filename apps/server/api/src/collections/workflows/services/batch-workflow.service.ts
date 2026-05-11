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
import { randomUUID } from 'crypto';

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

// ---------------------------------------------------------------------------
// Internal item shape stored in the `items` JSON column
// ---------------------------------------------------------------------------
interface BatchItem extends Record<string, unknown> {
  id: string;
  ingredientId: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Helper: parse the `items` JSON column defensively
// ---------------------------------------------------------------------------
function parseItems(raw: unknown): BatchItem[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BatchItem[];
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw as BatchItem[];
  return [];
}

// ---------------------------------------------------------------------------
// Derive counter values from the items array (source of truth)
// ---------------------------------------------------------------------------
function deriveCounters(items: BatchItem[]): {
  totalCount: number;
  completedCount: number;
  failedCount: number;
} {
  return {
    completedCount: items.filter(
      (i) => i.status === BatchWorkflowItemStatus.COMPLETED,
    ).length,
    failedCount: items.filter(
      (i) => i.status === BatchWorkflowItemStatus.FAILED,
    ).length,
    totalCount: items.length,
  };
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

    const validIngredients = await this.prisma.ingredient.findMany({
      where: {
        id: { in: ingredientIds },
        isDeleted: false,
        organizationId,
      },
      select: { id: true },
    });

    const validIds = new Set(validIngredients.map((i) => i.id));
    const invalidIds = ingredientIds.filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Ingredients not found or not accessible: ${invalidIds.join(', ')}`,
      );
    }

    // Each item gets a stable `id` so callers can reference it later.
    const items: BatchItem[] = ingredientIds.map((id) => ({
      id: randomUUID(),
      ingredientId: id,
      status: BatchWorkflowItemStatus.PENDING,
    }));

    const job = await this.prisma.batchWorkflowJob.create({
      data: {
        items: items as never,
        organizationId,
        status: BatchWorkflowJobStatus.PENDING,
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
   * Matches by item.ingredientId (the canonical key in the JSON schema).
   */
  async markItemProcessing(
    batchJobId: string,
    ingredientId: string,
  ): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const items = parseItems((job as unknown as Record<string, unknown>).items);
    const updatedItems = items.map((item) =>
      item.ingredientId === ingredientId
        ? {
            ...item,
            startedAt: new Date().toISOString(),
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
   * Matches by item.ingredientId.
   */
  async markItemCompleted(
    batchJobId: string,
    ingredientId: string,
    completion: BatchWorkflowItemCompletionInput = {},
  ): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const items = parseItems((job as unknown as Record<string, unknown>).items);
    const updatedItems = items.map((item) => {
      if (item.ingredientId !== ingredientId) return item;
      return {
        ...item,
        completedAt: new Date().toISOString(),
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
        items: updatedItems as never,
      } as never,
      where: { id: batchJobId },
    });

    await this.checkAndFinalizeJob(batchJobId);
  }

  /**
   * Mark an individual item as failed.
   * Matches by item.ingredientId.
   */
  async markItemFailed(
    batchJobId: string,
    ingredientId: string,
    error: string,
  ): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const items = parseItems((job as unknown as Record<string, unknown>).items);
    const updatedItems = items.map((item) =>
      item.ingredientId === ingredientId
        ? {
            ...item,
            completedAt: new Date().toISOString(),
            error,
            status: BatchWorkflowItemStatus.FAILED,
          }
        : item,
    );

    await this.prisma.batchWorkflowJob.update({
      data: {
        items: updatedItems as never,
      } as never,
      where: { id: batchJobId },
    });

    await this.checkAndFinalizeJob(batchJobId);
  }

  /**
   * Check if all items are done and finalize the job status.
   * Counters are computed from the items array — no separate counter columns.
   */
  private async checkAndFinalizeJob(batchJobId: string): Promise<void> {
    const job = await this.prisma.batchWorkflowJob.findFirst({
      where: { id: batchJobId },
    });
    if (!job) return;

    const items = parseItems((job as unknown as Record<string, unknown>).items);
    const { totalCount, completedCount, failedCount } = deriveCounters(items);

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
