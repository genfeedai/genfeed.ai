import { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BatchContentQueueService } from '@api/services/batch-content/batch-content-queue.service';
import type {
  BatchContentRequest,
  BatchContentResult,
  BatchStatus,
} from '@api/services/batch-content/interfaces/batch-content.interfaces';
import { ContentDraft } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { resolveRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class BatchContentService {
  private readonly context = 'BatchContentService';

  constructor(
    private readonly batchContentQueueService: BatchContentQueueService,
    private readonly brandsService: BrandsService,
    private readonly logger: LoggerService,
  ) {}

  async triggerBatch(
    request: BatchContentRequest,
    userId: string,
  ): Promise<{ batchId: string }> {
    await this.validateBrandOwnership(request.organizationId, request.brandId);

    const { batchId } = await this.batchContentQueueService.enqueueBatch(
      request,
      userId,
    );

    return { batchId };
  }

  async generateBatch(
    request: BatchContentRequest,
  ): Promise<BatchContentResult> {
    await this.validateBrandOwnership(request.organizationId, request.brandId);

    const { batchId } =
      await this.batchContentQueueService.enqueueBatch(request);

    while (true) {
      const status = this.batchContentQueueService.getBatchStatus(
        batchId,
        request.organizationId,
        request.brandId,
      );

      if (status.status === 'completed' || status.status === 'failed') {
        const ranked = this.rankDrafts(status.results);
        return {
          duration: this.batchContentQueueService.getBatchDuration(batchId),
          results: ranked,
          summary: {
            completed: status.completed,
            failed: status.failed,
            total: status.total,
          },
        };
      }

      await this.delay(100);
    }
  }

  getBatchStatus(
    batchId: string,
    organizationId: string,
    brandId: string,
  ): BatchStatus {
    const status = this.batchContentQueueService.getBatchStatus(
      batchId,
      organizationId,
      brandId,
    );

    if (status.status === 'completed' || status.status === 'failed') {
      return {
        ...status,
        results: this.rankDrafts(status.results),
      };
    }

    return status;
  }

  rankDrafts(drafts: ContentDraft[]): ContentDraft[] {
    const ranked = [...drafts]
      .sort((left, right) => {
        const rightConfidence = right.confidence ?? Number.NEGATIVE_INFINITY;
        const leftConfidence = left.confidence ?? Number.NEGATIVE_INFINITY;

        if (rightConfidence !== leftConfidence) {
          return rightConfidence - leftConfidence;
        }

        return right.content.length - left.content.length;
      })
      .map((draft, index) => ({
        ...draft,
        metadata: {
          ...(draft.metadata ?? {}),
          rank: index + 1,
        },
      }));

    this.logger.log(`${this.context} ranked drafts`, {
      rankedCount: ranked.length,
    });

    return ranked;
  }

  private async validateBrandOwnership(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    // Defence-in-depth re-check on top of the scoped query above. It has to read
    // the `organizationId` scalar: `brand.organization` is the Mongo-era alias, and
    // `String(undefined)` yields the literal `"undefined"`, which never equals the
    // caller's org — the guard would have rejected every legitimate brand.
    if (
      resolveRelationId(brand.organizationId, brand.organization) !==
      organizationId
    ) {
      throw new ForbiddenException(
        'Brand does not belong to this organization',
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
