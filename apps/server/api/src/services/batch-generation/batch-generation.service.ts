import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import type {
  BatchProcessOptions,
  ReviewInboxSummary,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import { UpdateBatchDto } from '@api/services/batch-generation/dto/update-batch.dto';
import { BatchStatus } from '@genfeedai/enums';
import type { IBatchSummary } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

export type {
  ReviewInboxItemSummary,
  ReviewInboxSummary,
} from '@api/services/batch-generation/batch-generation.types';

@Injectable()
export class BatchGenerationService {
  constructor(
    private readonly creationService: BatchGenerationCreationService,
    private readonly processingService: BatchGenerationProcessingService,
    private readonly reviewService: BatchGenerationReviewService,
  ) {}

  @HandleErrors('create batch', 'batch-generation')
  createBatch(
    dto: CreateBatchDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
  ): Promise<IBatchSummary> {
    return this.creationService.createBatch(dto, userId, orgId, idempotencyKey);
  }

  @HandleErrors('create manual review batch', 'batch-generation')
  createManualReviewBatch(
    dto: CreateManualReviewBatchDto,
    userId: string,
    orgId: string,
    idempotencyKey?: string,
  ): Promise<IBatchSummary> {
    return this.creationService.createManualReviewBatch(
      dto,
      userId,
      orgId,
      idempotencyKey,
    );
  }

  @HandleErrors('get review inbox summary', 'batch-generation')
  getReviewInboxSummary(
    orgId: string,
    brandId?: string,
    limit = 5,
  ): Promise<ReviewInboxSummary> {
    return this.reviewService.getReviewInboxSummary(orgId, brandId, limit);
  }

  @HandleErrors('process batch', 'batch-generation')
  processBatch(
    batchId: string,
    orgId: string,
    options?: BatchProcessOptions,
  ): Promise<IBatchSummary> {
    return this.processingService.processBatch(batchId, orgId, options);
  }

  @HandleErrors('get batch', 'batch-generation')
  getBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    return this.reviewService.getBatch(batchId, orgId);
  }

  @HandleErrors('get batches', 'batch-generation')
  getBatches(
    orgId: string,
    query?: { status?: BatchStatus; limit?: number; offset?: number },
  ): Promise<{ items: IBatchSummary[]; total: number }> {
    return this.reviewService.getBatches(orgId, query);
  }

  @HandleErrors('approve items', 'batch-generation')
  approveItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
    createdByUserId: string,
  ): Promise<IBatchSummary> {
    return this.reviewService.approveItems(
      batchId,
      itemIds,
      orgId,
      createdByUserId,
    );
  }

  @HandleErrors('reject items', 'batch-generation')
  rejectItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
  ): Promise<IBatchSummary> {
    return this.reviewService.rejectItems(
      batchId,
      itemIds,
      orgId,
      feedback,
      actorUserId,
    );
  }

  @HandleErrors('request changes', 'batch-generation')
  requestChanges(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
  ): Promise<IBatchSummary> {
    return this.reviewService.requestChanges(
      batchId,
      itemIds,
      orgId,
      feedback,
      actorUserId,
    );
  }

  @HandleErrors('cancel batch', 'batch-generation')
  cancelBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    return this.reviewService.cancelBatch(batchId, orgId);
  }

  @HandleErrors('update batch', 'batch-generation')
  updateBatch(
    batchId: string,
    dto: UpdateBatchDto,
    orgId: string,
  ): Promise<IBatchSummary> {
    return this.reviewService.updateBatch(batchId, dto, orgId);
  }
}
