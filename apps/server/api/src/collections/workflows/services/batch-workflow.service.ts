import type { BatchWorkflowJobDocument } from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import {
  type BatchWorkflowItemOutputSummary,
  BatchWorkflowItemStatus,
  BatchWorkflowJobStatus,
} from '@api/collections/workflows/schemas/batch-workflow-job.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateBatchJobInput {
  workflowId: string;
  ingredientIds: string[];
  userId: string;
  organizationId: string;
  idempotencyKey?: string;
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
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Create a new batch workflow job with items for each ingredient.
   */
  async createBatchJob(
    input: CreateBatchJobInput,
  ): Promise<BatchWorkflowJobDocument> {
    const {
      workflowId,
      ingredientIds,
      userId,
      organizationId,
      idempotencyKey,
    } = input;

    if (idempotencyKey) {
      return runIdempotent(this.cacheService, idempotencyKey, () =>
        this.doCreateBatchJob({
          workflowId,
          ingredientIds,
          userId,
          organizationId,
        }),
      );
    }

    return this.doCreateBatchJob({
      workflowId,
      ingredientIds,
      userId,
      organizationId,
    });
  }

  private async doCreateBatchJob(
    input: Omit<CreateBatchJobInput, 'idempotencyKey'>,
  ): Promise<BatchWorkflowJobDocument> {
    const { workflowId, ingredientIds, userId, organizationId } = input;

    if (!ingredientIds.length) {
      throw new BadRequestException('At least one ingredientId is required');
    }

    if (ingredientIds.length > 100) {
      throw new BadRequestException('Maximum 100 items per batch');
    }

    // Verify every ingredientId belongs to the caller's organization and is not deleted.
    // This prevents cross-tenant IDOR where an attacker submits IDs owned by another org.
    const ownedCount = await this.prisma.ingredient.count({
      where: {
        id: { in: ingredientIds },
        organizationId,
        isDeleted: false,
      } as never,
    });

    if (ownedCount !== ingredientIds.length) {
      this.logger.warn(`${this.logContext} ingredient ownership check failed`, {
        expected: ingredientIds.length,
        found: ownedCount,
        organizationId,
      });
      throw new BadRequestException(
        'One or more ingredient IDs are invalid or do not belong to your organization',
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
    const job = await findOrThrow(
      this.prisma.batchWorkflowJob,
      { where: { id: batchJobId } },
      'Batch job',
      batchJobId,
    );
    return job as unknown as BatchWorkflowJobDocument;
  }

  /**
   * Get a batch job by ID, scoped to organization.
   */
  async getBatchJobForOrg(
    batchJobId: string,
    organizationId: string,
  ): Promise<BatchWorkflowJobDocument> {
    const job = await findOrThrow(
      this.prisma.batchWorkflowJob,
      { where: { id: batchJobId, organizationId } },
      'Batch job',
      batchJobId,
    );
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
