import {
  AgentArtifactReferenceService,
  PostLifecycleService,
  scopedWhere,
} from '@api/index';
import {
  BatchItemStatus,
  BatchStatus,
  PersistedReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  IBatchSummary,
  IPublishApproval,
  VideoContinuityQaReport,
} from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

type ApproveBatchItemsContext = {
  batchId: string;
  batchItems: BatchItemFull[];
  batchRecord: BatchWithConfig;
  createdByUserId: string;
  itemIdSet: Set<string>;
  orgId: string;
  reviewedAt: string;
  selectedPostIds: string[];
};

import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  type BatchItemFull,
  type BatchWithConfig,
  type ReviewInboxItemSummary,
  type ReviewInboxSummary,
  resolveBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import {
  batchItemRowsInclude,
  writeBatchJsonAndItemRows,
} from '@api/services/batch-generation/batch-item-rows';
import { toPrismaBatchStatus } from '@api/services/batch-generation/batch-status-prisma.mapper';
import { UpdateBatchDto } from '@api/services/batch-generation/dto/update-batch.dto';
import { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';

@Injectable()
export class BatchGenerationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
    private readonly postLifecycleService: PostLifecycleService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly summaryService: BatchGenerationSummaryService,
    @Optional()
    private readonly harnessReviewFeedbackService?: HarnessReviewFeedbackService,
  ) {}

  /**
   * Bootstrap/overview review counts for an org (or brand).
   *
   * Counts and recent ready items come from typed `batch_items` columns —
   * `groupBy` for the counters and a capped `findMany` for the preview strip.
   * The previous path loaded every batch JSON blob and filtered in JS.
   */
  async getReviewInboxSummary(
    orgId: string,
    brandId?: string,
    limit = 5,
  ): Promise<ReviewInboxSummary> {
    const recentLimit = Math.max(1, Math.min(limit, 10));
    const itemWhere = scopedWhere(orgId, {
      ...(brandId ? { brandId } : {}),
    });

    const [groups, readyRows] = await Promise.all([
      this.prisma.batchItem.groupBy({
        _count: { _all: true },
        by: ['status', 'reviewDecision'],
        where: itemWhere,
      }),
      this.prisma.batchItem.findMany({
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
        where: scopedWhere(orgId, {
          ...(brandId ? { brandId } : {}),
          reviewDecision: null,
          status: BatchItemStatus.COMPLETED,
        }),
      }),
    ]);

    let approvedCount = 0;
    let rejectedCount = 0;
    let changesRequestedCount = 0;
    let pendingCount = 0;
    let readyCount = 0;

    for (const group of groups) {
      const count = group._count._all;
      if (group.reviewDecision === PersistedReviewDecision.APPROVED) {
        approvedCount += count;
        continue;
      }
      if (group.reviewDecision === PersistedReviewDecision.REJECTED) {
        rejectedCount += count;
        continue;
      }
      if (group.reviewDecision === PersistedReviewDecision.REQUEST_CHANGES) {
        changesRequestedCount += count;
        continue;
      }
      if (
        group.status === BatchItemStatus.PENDING ||
        group.status === BatchItemStatus.PROCESSING
      ) {
        pendingCount += count;
        continue;
      }
      if (
        group.status === BatchItemStatus.COMPLETED &&
        group.reviewDecision == null
      ) {
        readyCount += count;
      }
    }

    return {
      approvedCount,
      changesRequestedCount,
      pendingCount,
      readyCount,
      recentItems: readyRows.map((row) => this.toReviewInboxItemSummary(row)),
      rejectedCount,
    };
  }

  async getBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batch = (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;

    return this.summaryService.toBatchSummary(batch);
  }

  async getBatches(
    orgId: string,
    query?: { status?: BatchStatus; limit?: number; offset?: number },
  ): Promise<{ items: IBatchSummary[]; total: number }> {
    const limit = Math.min(query?.limit ?? 20, 100);
    const offset = query?.offset ?? 0;

    const [batches, total] = await Promise.all([
      this.prisma.batch.findMany({
        include: batchItemRowsInclude(orgId),
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        where: scopedWhere(orgId, {
          ...(query?.status
            ? { status: toPrismaBatchStatus(query.status) }
            : {}),
        }),
      }),
      this.prisma.batch.count({
        where: scopedWhere(orgId, {
          ...(query?.status
            ? { status: toPrismaBatchStatus(query.status) }
            : {}),
        }),
      }),
    ]);

    return {
      items: await this.summaryService.toBatchSummaries(
        batches as unknown as BatchWithConfig[],
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
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    );

    const itemIdSet = new Set(itemIds);
    const reviewedAt = new Date().toISOString();

    const batchItems = resolveBatchItems(batchRecord);
    const selectedPostIds = this.getSelectedPostIds(batchItems, itemIdSet);
    const updatedBatch = await this.prisma.$transaction((transaction) =>
      this.approveItemsInTransaction(transaction, {
        batchId,
        batchItems,
        batchRecord: batchRecord as unknown as BatchWithConfig,
        createdByUserId,
        itemIdSet,
        orgId,
        reviewedAt,
        selectedPostIds,
      }),
    );

    this.logger.log(`Approved ${itemIds.length} items in batch ${batchId}`, {
      batchId,
      itemCount: itemIds.length,
    });

    return this.summaryService.toBatchSummary(updatedBatch);
  }

  private async approveItemsInTransaction(
    transaction: Prisma.TransactionClient,
    params: ApproveBatchItemsContext,
  ): Promise<BatchWithConfig> {
    const {
      batchId,
      batchItems,
      batchRecord,
      createdByUserId,
      itemIdSet,
      orgId,
      reviewedAt,
      selectedPostIds,
    } = params;
    const versionPinIds = new Map<string, string>();
    const publishApprovals = new Map<string, IPublishApproval>();

    for (const postId of selectedPostIds) {
      const item = batchItems.find((candidate) => candidate.postId === postId);
      if (item?.scheduledDate) {
        const approval =
          await this.publishApprovalsService.createForCurrentPost({
            actorUserId: createdByUserId,
            mode: 'scheduled',
            organizationId: orgId,
            postId,
            provenance: {
              batchId,
              reviewItemId: item.id,
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
              ...(batchRecord.brandId ? { brandId: batchRecord.brandId } : {}),
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
      if (itemIdSet.has(item.id) && item.status === BatchItemStatus.COMPLETED) {
        const versionPinId = item.postId
          ? versionPinIds.get(item.postId)
          : undefined;
        item.reviewDecision = ReviewDecision.APPROVED;
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

    const postIdsToScheduleSet = new Set(postIdsToSchedule);
    const approvalUpdates = await Promise.all(
      selectedPostIds
        .filter((postId) => !postIdsToScheduleSet.has(postId))
        .map((postId) =>
          transaction.post.updateMany({
            data: {
              reviewDecision: PersistedReviewDecision.APPROVED,
              reviewVersionPinId: versionPinIds.get(postId),
              reviewedAt: new Date(reviewedAt),
            },
            where: scopedWhere(orgId, { id: postId }),
          }),
        ),
    );
    if (approvalUpdates.some((result) => result.count !== 1)) {
      throw new NotFoundException({
        message: 'A canonical Post disappeared before approval completed.',
      });
    }

    for (const postId of postIdsToSchedule) {
      await this.postLifecycleService.transition(
        {
          actorId: createdByUserId,
          mutation: {
            reviewDecision: PersistedReviewDecision.APPROVED,
            reviewVersionPinId: versionPinIds.get(postId),
            reviewedAt: new Date(reviewedAt),
          },
          nextState: TargetExecutionState.SCHEDULED,
          organizationId: orgId,
          postId,
          reason: 'Review item approved for scheduling',
        },
        transaction,
      );
    }

    const batchUpdate = await writeBatchJsonAndItemRows(transaction, {
      batchId,
      brandId: batchRecord.brandId,
      items: batchItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException({
        message: `Batch ${batchId} disappeared before approval completed`,
      });
    }

    const updated = await transaction.batch.findFirst({
      include: batchItemRowsInclude(orgId),
      where: scopedWhere(orgId, { id: batchId }),
    });
    if (!updated) {
      throw new NotFoundException('Batch', batchId);
    }
    return updated as unknown as BatchWithConfig;
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
        decision: ReviewDecision.APPROVED,
        reviewedAt,
        reviewerId,
        ...(versionPinId ? { versionPinId } : {}),
      },
    ];
  }

  private toReviewInboxItemSummary(row: {
    batchId: string;
    createdAt: Date;
    data: Prisma.JsonValue;
    id: string;
    status: string;
  }): ReviewInboxItemSummary {
    const data =
      typeof row.data === 'object' &&
      row.data !== null &&
      !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {};
    const format = typeof data.format === 'string' ? data.format : 'image';
    const caption = typeof data.caption === 'string' ? data.caption : undefined;
    const prompt = typeof data.prompt === 'string' ? data.prompt : undefined;

    return {
      batchId: row.batchId,
      createdAt: row.createdAt.toISOString(),
      format,
      id: row.id,
      mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
      platform: typeof data.platform === 'string' ? data.platform : undefined,
      postId: typeof data.postId === 'string' ? data.postId : undefined,
      reviewDecision: ReviewDecision.UNSET,
      status: row.status,
      summary:
        caption ??
        prompt ??
        `${format.charAt(0).toUpperCase()}${format.slice(1)} ready for review`,
      continuityQa: isContinuityQaReport(data.continuityQa)
        ? data.continuityQa
        : undefined,
    };
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
              itemIdSet.has(item.id) &&
              item.status === BatchItemStatus.COMPLETED &&
              Boolean(item.postId),
          )
          .flatMap((item) => (item.postId ? [item.postId] : [])),
      ),
    ];
  }

  /**
   * Feeds human rejections/change-requests on generated batch items back
   * into the brand's harness profile (anti-examples) so future generations
   * avoid repeating the rejected pattern. Fire-and-forget: the harness
   * service never throws, but this is still not awaited so a slow or failed
   * feedback write can never delay or fail the review action itself.
   */
  private recordHarnessReviewFeedback(
    items: BatchItemFull[],
    decision:
      | typeof ReviewDecision.REJECTED
      | typeof ReviewDecision.REQUEST_CHANGES,
    organizationId: string,
    brandId: string | undefined,
    reason?: string,
  ): void {
    if (!this.harnessReviewFeedbackService || items.length === 0) {
      return;
    }

    for (const item of items) {
      const content = item.caption ?? item.prompt;
      if (!content) {
        continue;
      }
      void this.harnessReviewFeedbackService.recordReviewDecision({
        brandId,
        content,
        decision,
        organizationId,
        reason,
        sourceId: item.id,
        sourceType: 'batch_item',
      });
    }
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
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    );

    const itemIdSet = new Set(itemIds);
    const postIdsToReject: string[] = [];
    const reviewedAt = new Date().toISOString();

    const batchItems = resolveBatchItems(batchRecord);
    const rejectedItems: BatchItemFull[] = [];

    for (const item of batchItems) {
      if (itemIdSet.has(item.id)) {
        item.status = BatchItemStatus.SKIPPED;
        item.reviewDecision = ReviewDecision.REJECTED;
        item.reviewFeedback = feedback;
        item.reviewedAt = reviewedAt;
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          {
            decision: ReviewDecision.REJECTED,
            feedback,
            reviewedAt,
            ...(actorUserId ? { reviewerId: actorUserId } : {}),
          },
        ];
        if (item.postId) {
          postIdsToReject.push(item.postId);
        }
        rejectedItems.push(item);
      }
    }

    this.recordHarnessReviewFeedback(
      rejectedItems,
      ReviewDecision.REJECTED,
      orgId,
      batchRecord.brandId ?? undefined,
      feedback,
    );

    if (postIdsToReject.length > 0) {
      for (const postId of postIdsToReject) {
        await this.postLifecycleService.transition({
          actorId: actorUserId,
          mutation: {
            isDeleted: true,
            reviewDecision: PersistedReviewDecision.REJECTED,
            reviewedAt: new Date(reviewedAt),
            reviewFeedback: feedback,
          },
          nextState: TargetExecutionState.CANCELLED,
          organizationId: orgId,
          postId,
          reason: feedback || 'Review item rejected',
        });
      }
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

    const batchUpdate = await writeBatchJsonAndItemRows(this.prisma, {
      batchId,
      brandId: batchRecord.brandId,
      items: batchItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;

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
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    );

    const itemIdSet = new Set(itemIds);
    const postIdsToKeepAsDraft: string[] = [];
    const reviewedAt = new Date().toISOString();

    const batchItems = resolveBatchItems(batchRecord);
    const changesRequestedItems: BatchItemFull[] = [];

    for (const item of batchItems) {
      if (itemIdSet.has(item.id) && item.status === BatchItemStatus.COMPLETED) {
        item.reviewDecision = ReviewDecision.REQUEST_CHANGES;
        item.reviewFeedback = feedback;
        item.reviewedAt = reviewedAt;
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          {
            decision: ReviewDecision.REQUEST_CHANGES,
            feedback,
            reviewedAt,
            ...(actorUserId ? { reviewerId: actorUserId } : {}),
          },
        ];
        if (item.postId) {
          postIdsToKeepAsDraft.push(item.postId);
        }
        changesRequestedItems.push(item);
      }
    }

    this.recordHarnessReviewFeedback(
      changesRequestedItems,
      ReviewDecision.REQUEST_CHANGES,
      orgId,
      batchRecord.brandId ?? undefined,
      feedback,
    );

    if (postIdsToKeepAsDraft.length > 0) {
      for (const postId of postIdsToKeepAsDraft) {
        await this.postLifecycleService.transition({
          actorId: actorUserId,
          mutation: {
            reviewDecision: PersistedReviewDecision.REQUEST_CHANGES,
            reviewedAt: new Date(reviewedAt),
            reviewFeedback: feedback,
          },
          nextState: TargetExecutionState.DRAFT,
          organizationId: orgId,
          postId,
          reason: feedback || 'Changes requested during review',
        });
      }
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

    const batchUpdate = await writeBatchJsonAndItemRows(this.prisma, {
      batchId,
      brandId: batchRecord.brandId,
      items: batchItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;

    this.logger.log(
      `Requested changes for ${itemIds.length} items in batch ${batchId}`,
      {
        batchId,
        itemCount: itemIds.length,
      },
    );

    return this.summaryService.toBatchSummary(updatedBatch);
  }

  async assignItem(
    batchId: string,
    itemId: string,
    assigneeId: string,
    orgId: string,
  ): Promise<IBatchSummary> {
    await this.assertAssignableOrgMember(orgId, assigneeId);
    return this.setItemAssignee(batchId, itemId, orgId, assigneeId);
  }

  async unassignItem(
    batchId: string,
    itemId: string,
    orgId: string,
  ): Promise<IBatchSummary> {
    return this.setItemAssignee(batchId, itemId, orgId, null);
  }

  async cancelBatch(batchId: string, orgId: string): Promise<IBatchSummary> {
    const batchRecord = await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    );

    const batchItems = resolveBatchItems(batchRecord).map((item) => ({
      ...item,
      status:
        item.status === BatchItemStatus.PENDING
          ? BatchItemStatus.SKIPPED
          : item.status,
    }));

    const batchUpdate = await writeBatchJsonAndItemRows(this.prisma, {
      batchId,
      brandId: batchRecord.brandId,
      extraBatchData: {
        status: toPrismaBatchStatus(BatchStatus.CANCELLED),
      },
      items: batchItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;

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
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    );

    const batchUpdate = await this.prisma.batch.updateMany({
      data: {
        ...(dto.status ? { status: toPrismaBatchStatus(dto.status) } : {}),
      },
      where: scopedWhere(orgId, { id: batchRecord.id }),
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }
    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;

    return this.summaryService.toBatchSummary(updatedBatch);
  }

  private async assertAssignableOrgMember(
    organizationId: string,
    assigneeId: string,
  ): Promise<void> {
    const member = await this.prisma.member.findFirst({
      select: {
        id: true,
        user: {
          select: {
            id: true,
            isDeleted: true,
          },
        },
      },
      where: scopedWhere(organizationId, {
        isActive: true,
        userId: assigneeId,
      }),
    });

    if (!member?.user || member.user.isDeleted) {
      throw new BadRequestException(
        'Assignee must be an active member of this organization',
      );
    }
  }

  private async setItemAssignee(
    batchId: string,
    itemId: string,
    orgId: string,
    assigneeId: string | null,
  ): Promise<IBatchSummary> {
    const batchRecord = await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    );

    const batchItems = resolveBatchItems(batchRecord);
    const target = batchItems.find((item) => item.id === itemId);
    if (!target) {
      throw new NotFoundException('Batch item', itemId);
    }

    target.assigneeId = assigneeId;

    const batchUpdate = await writeBatchJsonAndItemRows(this.prisma, {
      batchId,
      brandId: batchRecord.brandId,
      items: batchItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Batch', batchId);
    }

    const updatedBatch = (await findOrThrow(
      this.prisma.batch,
      {
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      },
      'Batch',
      batchId,
    )) as unknown as BatchWithConfig;

    this.logger.log(
      assigneeId
        ? `Assigned item ${itemId} in batch ${batchId}`
        : `Unassigned item ${itemId} in batch ${batchId}`,
      {
        assigneeId,
        batchId,
        itemId,
      },
    );

    return this.summaryService.toBatchSummary(updatedBatch);
  }
}

function isContinuityQaReport(
  value: unknown,
): value is VideoContinuityQaReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schemaVersion === 1 &&
    Array.isArray((value as Record<string, unknown>).clips)
  );
}
