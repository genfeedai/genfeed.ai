import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import {
  type BatchItemFull,
  type BatchWithConfig,
  cloneBatchItems,
  type ReviewInboxItemSummary,
  type ReviewInboxSummary,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { UpdateBatchDto } from '@api/services/batch-generation/dto/update-batch.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { BatchItemStatus, BatchStatus, PostStatus } from '@genfeedai/enums';
import type { IBatchSummary, IPublishApproval } from '@genfeedai/interfaces';
import { AgentArtifactReferenceService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BatchGenerationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly summaryService: BatchGenerationSummaryService,
  ) {}

  async getReviewInboxSummary(
    orgId: string,
    brandId?: string,
    limit = 5,
  ): Promise<ReviewInboxSummary> {
    const batches = (await this.prisma.batch.findMany({
      where: {
        isDeleted: false,
        organizationId: orgId,
        ...(brandId ? { brandId } : {}),
      },
    })) as BatchWithConfig[];

    let approvedCount = 0;
    let rejectedCount = 0;
    let changesRequestedCount = 0;
    let pendingCount = 0;
    let readyCount = 0;
    const readyItems: ReviewInboxItemSummary[] = [];

    for (const batch of batches) {
      const batchItems = cloneBatchItems(batch.items);
      for (const item of batchItems) {
        const decision = item.reviewDecision;
        const status = item.status;

        if (decision === 'approved') {
          approvedCount++;
        } else if (decision === 'rejected') {
          rejectedCount++;
        } else if (decision === 'request_changes') {
          changesRequestedCount++;
        } else if (
          status === BatchItemStatus.GENERATING ||
          status === BatchItemStatus.PENDING
        ) {
          pendingCount++;
        } else if (status === BatchItemStatus.COMPLETED && !decision) {
          readyCount++;
          readyItems.push({
            batchId: batch.id,
            createdAt: item.createdAt ?? batch.createdAt.toISOString(),
            format: item.format,
            id: item._id,
            mediaUrl: item.mediaUrl,
            platform: item.platform,
            postId: item.postId,
            reviewDecision: undefined,
            status: item.status,
            summary:
              item.caption ??
              item.prompt ??
              `${item.format.charAt(0).toUpperCase()}${item.format.slice(1)} ready for review`,
          });
        }
      }
    }

    // Sort ready items by createdAt desc, take limit
    readyItems.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const recentItems = readyItems.slice(0, Math.max(1, Math.min(limit, 10)));

    return {
      approvedCount,
      changesRequestedCount,
      pendingCount,
      readyCount,
      recentItems,
      rejectedCount,
    };
  }

  async getBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batch = (await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    )) as BatchWithConfig;

    return this.summaryService.toBatchSummary(batch);
  }

  async getBatches(
    orgId: string,
    query?: { status?: BatchStatus; limit?: number; offset?: number },
  ): Promise<{ items: IBatchSummary[]; total: number }> {
    const limit = Math.min(query?.limit ?? 20, 100);
    const offset = query?.offset ?? 0;

    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId: orgId,
    };
    if (query?.status) {
      where.status = query.status;
    }

    const [batches, total] = await Promise.all([
      this.prisma.batch.findMany({
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        where: where as never,
      }),
      this.prisma.batch.count({ where: where as never }),
    ]);

    return {
      items: await this.summaryService.toBatchSummaries(
        batches as BatchWithConfig[],
      ),
      total,
    };
  }

  async approveItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
    createdByUserId: string,
  ): Promise<IBatchSummary> {
    const batchRecord = await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    );

    const itemIdSet = new Set(itemIds);
    const reviewedAt = new Date().toISOString();

    const batchItems = cloneBatchItems(batchRecord.items);
    const selectedPostIds = this.getSelectedPostIds(batchItems, itemIdSet);
    const updatedBatch = await this.prisma.$transaction(async (transaction) => {
      const versionPinIds = new Map<string, string>();
      const publishApprovals = new Map<string, IPublishApproval>();

      for (const postId of selectedPostIds) {
        const item = batchItems.find(
          (candidate) => candidate.postId === postId,
        );
        if (item?.scheduledDate) {
          const approval =
            await this.publishApprovalsService.createForCurrentPost({
              actorUserId: createdByUserId,
              mode: 'scheduled',
              organizationId: orgId,
              postId,
              provenance: {
                batchId,
                reviewItemId: item._id,
                surface: 'review-queue',
              },
              transaction,
            });
          publishApprovals.set(postId, approval);
          versionPinIds.set(postId, approval.artifactVersionPinId);
        } else {
          const versionPin =
            await this.agentArtifactReferenceService.createOrReuseVersionPin({
              createdByUserId,
              reference: {
                ...(batchRecord.brandId
                  ? { brandId: batchRecord.brandId }
                  : {}),
                kind: 'post',
                organizationId: orgId,
                recordId: postId,
                serializer: 'post',
              },
              transaction,
            });
          versionPinIds.set(postId, versionPin.id);
        }
      }

      const postIdsToSchedule: string[] = [];

      for (const item of batchItems) {
        if (
          itemIdSet.has(item._id) &&
          item.status === BatchItemStatus.COMPLETED
        ) {
          const versionPinId = item.postId
            ? versionPinIds.get(item.postId)
            : undefined;
          item.reviewDecision = 'approved';
          item.publishApproval = item.postId
            ? publishApprovals.get(item.postId)
            : undefined;
          item.reviewFeedback = undefined;
          item.versionPinId = versionPinId;
          item.reviewedAt = reviewedAt;
          this.appendApprovedReviewEvent(
            item,
            reviewedAt,
            createdByUserId,
            versionPinId,
          );
          if (item.postId && item.scheduledDate) {
            postIdsToSchedule.push(item.postId);
          }
        }
      }

      const approvalUpdates = await Promise.all(
        selectedPostIds.map((postId) =>
          transaction.post.updateMany({
            data: {
              reviewDecision: 'APPROVED' as never,
              reviewVersionPinId: versionPinIds.get(postId),
              reviewedAt: new Date(reviewedAt),
            },
            where: {
              id: postId,
              isDeleted: false,
              organizationId: orgId,
            },
          }),
        ),
      );
      if (approvalUpdates.some((result) => result.count !== 1)) {
        throw new NotFoundException({
          message: 'A canonical Post disappeared before approval completed.',
        });
      }

      if (postIdsToSchedule.length > 0) {
        await transaction.post.updateMany({
          data: { status: PostStatus.SCHEDULED as never },
          where: {
            id: { in: postIdsToSchedule },
            isDeleted: false,
            organizationId: orgId,
          },
        });
      }

      const batchUpdate = await transaction.batch.updateMany({
        data: { items: batchItems as never },
        where: { id: batchId, isDeleted: false, organizationId: orgId },
      });
      if (batchUpdate.count !== 1) {
        throw new NotFoundException({
          message: `Batch ${batchId} disappeared before approval completed`,
        });
      }

      const updated = await transaction.batch.findFirst({
        where: { id: batchId, isDeleted: false, organizationId: orgId },
      });
      if (!updated) {
        throw new NotFoundException('Batch', batchId);
      }
      return updated as BatchWithConfig;
    });

    this.logger.log(`Approved ${itemIds.length} items in batch ${batchId}`, {
      batchId,
      itemCount: itemIds.length,
    });

    return this.summaryService.toBatchSummary(updatedBatch);
  }

  private appendApprovedReviewEvent(
    item: BatchItemFull,
    reviewedAt: string,
    reviewerId: string,
    versionPinId?: string,
  ): void {
    item.reviewEvents = [
      ...(item.reviewEvents ?? []),
      {
        decision: 'approved',
        reviewedAt,
        reviewerId,
        ...(versionPinId ? { versionPinId } : {}),
      },
    ];
  }

  private getSelectedPostIds(
    batchItems: BatchItemFull[],
    itemIdSet: Set<string>,
  ): string[] {
    return [
      ...new Set(
        batchItems
          .filter(
            (item) =>
              itemIdSet.has(item._id) &&
              item.status === BatchItemStatus.COMPLETED &&
              Boolean(item.postId),
          )
          .flatMap((item) => (item.postId ? [item.postId] : [])),
      ),
    ];
  }

  async rejectItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
  ): Promise<IBatchSummary> {
    const batchRecord = await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    );

    const itemIdSet = new Set(itemIds);
    const postIdsToReject: string[] = [];
    const reviewedAt = new Date().toISOString();

    const batchItems = cloneBatchItems(batchRecord.items);

    for (const item of batchItems) {
      if (itemIdSet.has(item._id)) {
        item.status = BatchItemStatus.SKIPPED;
        item.reviewDecision = 'rejected';
        item.reviewFeedback = feedback;
        item.reviewedAt = reviewedAt;
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          {
            decision: 'rejected',
            feedback,
            reviewedAt,
            ...(actorUserId ? { reviewerId: actorUserId } : {}),
          },
        ];
        if (item.postId) {
          postIdsToReject.push(item.postId);
        }
      }
    }

    if (postIdsToReject.length > 0) {
      // Soft-delete rejected posts
      await this.prisma.post.updateMany({
        data: {
          isDeleted: true,
          reviewDecision: 'REJECTED' as never,
          reviewedAt: new Date(reviewedAt),
          reviewFeedback: feedback,
        },
        where: {
          id: { in: postIdsToReject },
          isDeleted: false,
          organizationId: orgId,
        },
      });
      await Promise.all(
        postIdsToReject.map((postId) =>
          this.publishApprovalsService.invalidatePost(
            orgId,
            postId,
            'The review item was rejected.',
            actorUserId,
          ),
        ),
      );
    }

    const batchUpdate = await this.prisma.batch.updateMany({
      data: { items: batchItems as never },
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    )) as BatchWithConfig;

    this.logger.log(`Rejected ${itemIds.length} items in batch ${batchId}`, {
      batchId,
      itemCount: itemIds.length,
    });

    return this.summaryService.toBatchSummary(updatedBatch);
  }

  async requestChanges(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
  ): Promise<IBatchSummary> {
    const batchRecord = await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    );

    const itemIdSet = new Set(itemIds);
    const postIdsToKeepAsDraft: string[] = [];
    const reviewedAt = new Date().toISOString();

    const batchItems = cloneBatchItems(batchRecord.items);

    for (const item of batchItems) {
      if (
        itemIdSet.has(item._id) &&
        item.status === BatchItemStatus.COMPLETED
      ) {
        item.reviewDecision = 'request_changes';
        item.reviewFeedback = feedback;
        item.reviewedAt = reviewedAt;
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          {
            decision: 'request_changes',
            feedback,
            reviewedAt,
            ...(actorUserId ? { reviewerId: actorUserId } : {}),
          },
        ];
        if (item.postId) {
          postIdsToKeepAsDraft.push(item.postId);
        }
      }
    }

    if (postIdsToKeepAsDraft.length > 0) {
      await this.prisma.post.updateMany({
        data: {
          reviewDecision: 'REQUEST_CHANGES' as never,
          reviewedAt: new Date(reviewedAt),
          reviewFeedback: feedback,
          status: PostStatus.DRAFT as never,
        },
        where: {
          id: { in: postIdsToKeepAsDraft },
          isDeleted: false,
          organizationId: orgId,
        },
      });
      await Promise.all(
        postIdsToKeepAsDraft.map((postId) =>
          this.publishApprovalsService.invalidatePost(
            orgId,
            postId,
            'Changes were requested for the approved version.',
            actorUserId,
          ),
        ),
      );
    }

    const batchUpdate = await this.prisma.batch.updateMany({
      data: { items: batchItems as never },
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    )) as BatchWithConfig;

    this.logger.log(
      `Requested changes for ${itemIds.length} items in batch ${batchId}`,
      {
        batchId,
        itemCount: itemIds.length,
      },
    );

    return this.summaryService.toBatchSummary(updatedBatch);
  }

  async cancelBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batchRecord = await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    );

    const batchItems = cloneBatchItems(batchRecord.items).map((item) => ({
      ...item,
      status:
        item.status === BatchItemStatus.PENDING
          ? BatchItemStatus.SKIPPED
          : item.status,
    }));

    const batchUpdate = await this.prisma.batch.updateMany({
      data: {
        items: batchItems as never,
        status: BatchStatus.CANCELLED as never,
      },
      where: { id: batchId, isDeleted: false, organizationId: orgId },
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    )) as BatchWithConfig;

    this.logger.log(`Batch cancelled: ${batchId}`, { batchId });

    return this.summaryService.toBatchSummary(updatedBatch);
  }

  /**
   * Update a batch by ID. Status transitions to CANCELLED are routed
   * through cancelBatch() to preserve its guard (tenant-scoped existence
   * check via findOrThrow) and cascade (marking pending items as skipped).
   */
  async updateBatch(
    batchId: string,
    dto: UpdateBatchDto,
    orgId: string,
  ): Promise<IBatchSummary> {
    if (dto.status === BatchStatus.CANCELLED) {
      return this.cancelBatch(batchId, orgId);
    }

    const batchRecord = await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    );

    const batchUpdate = await this.prisma.batch.updateMany({
      data: {
        status: dto.status as never,
      },
      where: {
        id: batchRecord.id,
        isDeleted: false,
        organizationId: orgId,
      },
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      { where: { id: batchId, isDeleted: false, organizationId: orgId } },
      'Batch',
      batchId,
    )) as BatchWithConfig;

    return this.summaryService.toBatchSummary(updatedBatch);
  }
}
