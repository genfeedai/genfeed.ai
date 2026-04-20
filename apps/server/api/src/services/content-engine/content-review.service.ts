import { BrandsService } from '@api/collections/brands/services/brands.service';
import { type ContentDraftDocument } from '@api/collections/content-drafts/schemas/content-draft.schema';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { ContentDraftStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentReviewService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly contentDraftsService: ContentDraftsService,
    private readonly brandsService: BrandsService,
    private readonly logger: LoggerService,
  ) {}

  getQueue(
    organizationId: string,
    brandId: string,
  ): Promise<ContentDraftDocument[]> {
    return this.contentDraftsService.listByBrand(
      organizationId,
      brandId,
      ContentDraftStatus.PENDING,
    );
  }

  approveDraft(
    organizationId: string,
    draftId: string,
    userId: string,
  ): Promise<ContentDraftDocument> {
    return this.contentDraftsService.approve(draftId, organizationId, userId);
  }

  rejectDraft(
    organizationId: string,
    draftId: string,
    reason?: string,
  ): Promise<ContentDraftDocument> {
    return this.contentDraftsService.reject(draftId, organizationId, reason);
  }

  bulkApprove(
    organizationId: string,
    ids: string[],
    userId: string,
  ): Promise<{ modifiedCount: number }> {
    return this.contentDraftsService.bulkApprove(ids, organizationId, userId);
  }

  /**
   * Auto-approve drafts that meet the brand's confidence threshold.
   * Called after execution to immediately approve high-confidence content.
   */
  async autoApproveIfEligible(
    organizationId: string,
    brandId: string,
    draftId: string,
    confidence?: number,
  ): Promise<boolean> {
    if (confidence === undefined) {
      return false;
    }

    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!brand) {
      return false;
    }

    const autoPublish = brand.agentConfig?.autoPublish;

    if (!autoPublish?.enabled) {
      return false;
    }

    const threshold = autoPublish.confidenceThreshold ?? 0.8;

    if (confidence >= threshold) {
      await this.contentDraftsService.approve(
        draftId,
        organizationId,
        'system-auto-approve',
      );

      this.logger.log(
        `${this.constructorName}: Auto-approved draft ${draftId} (confidence: ${confidence}, threshold: ${threshold})`,
        { brandId, organizationId },
      );

      return true;
    }

    return false;
  }
}
