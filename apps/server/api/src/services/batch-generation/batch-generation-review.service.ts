import {
  InvalidChannelTargetScheduleException,
  toChannelTargetError,
} from '@api/collections/posts/services/channel-target-schedule-validation.util';
import {
  AgentArtifactReferenceService,
  PostLifecycleService,
  scopedWhere,
} from '@api/index';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { recordAgentReviewOutcome } from '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import {
  BatchItemStatus,
  BatchStatus,
  PersistedReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IBatchSummary,
  VideoContinuityQaReport,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
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
  autonomous: boolean;
  expectedPostVersions?: Record<string, string>;
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
  toBatchWithConfig,
} from '@api/services/batch-generation/batch-generation.types';
import {
  appendApprovedReviewEvent,
  pinApprovedDrafts,
} from '@api/services/batch-generation/batch-generation-review-approval';
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
    private readonly autonomousPublishPolicy: AutonomousPublishPolicyService,
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
    const batch = toBatchWithConfig(
      await findOrThrow(
        this.prisma.batch,
        {
          include: batchItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: batchId }),
        },
        'Batch',
        batchId,
      ),
    );

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
        batches.map(toBatchWithConfig),
      ),
      total,
    };
  }

  async approveItems(
    batchId: string,
    itemIds: string[],
    orgId: string,
    createdByUserId: string,
    autonomous = false,
    expectedPostVersions?: Record<string, string>,
  ): Promise<IBatchSummary> {
    const updatedBatch = await this.withLockedBatch(
      batchId,
      orgId,
      async (transaction, batchRecord) => {
        const batchItems = resolveBatchItems(batchRecord);
        const itemIdSet = new Set(itemIds);
        this.assertExpectedPostSet(batchItems, itemIds, expectedPostVersions);
        return this.approveItemsInTransaction(transaction, {
          batchId,
          batchItems,
          batchRecord,
          createdByUserId,
          itemIdSet,
          orgId,
          autonomous,
          expectedPostVersions,
          reviewedAt: new Date().toISOString(),
          selectedPostIds: this.getSelectedPostIds(batchItems, itemIdSet),
        });
      },
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
      autonomous,
      expectedPostVersions,
    } = params;
    const { publishApprovals, versionPinIds } = await pinApprovedDrafts({
      agentArtifactReferenceService: this.agentArtifactReferenceService,
      assertExpectedPostVersion: (postId, updatedAt, expected) =>
        this.assertExpectedPostVersion(postId, updatedAt, expected),
      autonomous,
      autonomousPublishPolicy: this.autonomousPublishPolicy,
      batchId,
      batchItems,
      batchRecord,
      createdByUserId,
      expectedPostVersions,
      orgId,
      publishApprovalsService: this.publishApprovalsService,
      selectedPostIds,
      transaction,
    });

    const postIdsToSchedule: string[] = [];

    for (const item of batchItems) {
      if (
        itemIdSet.has(item.id) &&
        item.status === BatchItemStatus.COMPLETED &&
        item.reviewDecision !== ReviewDecision.APPROVED
      ) {
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
        appendApprovedReviewEvent(
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
      try {
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
      } catch (error: unknown) {
        // Approving a batch approves every selected item in one call. One
        // item's content failing the channel contract (#5193) — media the
        // chosen platform can't take, a caption that no longer fits — must
        // not undo the approval decision recorded for the rest; fail just
        // that item's post instead of the whole batch.
        if (!(error instanceof InvalidChannelTargetScheduleException)) {
          throw error;
        }
        this.logger.warn('Approved review item failed channel validation', {
          batchId,
          error: error.message,
          orgId,
          postId,
        });
        try {
          await this.postLifecycleService.transition(
            {
              actorId: createdByUserId,
              error: toChannelTargetError(error.validation),
              mutation: {
                reviewDecision: PersistedReviewDecision.APPROVED,
                reviewVersionPinId: versionPinIds.get(postId),
                reviewedAt: new Date(reviewedAt),
              },
              nextState: TargetExecutionState.FAILED,
              organizationId: orgId,
              postId,
              reason: 'Channel target failed validation while approving',
            },
            transaction,
          );
        } catch (recoveryError: unknown) {
          this.logger.error(
            'Failed to record channel validation failure on review item',
            { batchId, error: recoveryError, orgId, postId },
          );
        }
      }
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
    return toBatchWithConfig(updated);
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
              item.reviewDecision !== ReviewDecision.APPROVED &&
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
    expectedPostVersions?: Record<string, string>,
  ): Promise<IBatchSummary> {
    return this.reviewNegative(
      batchId,
      itemIds,
      orgId,
      ReviewDecision.REJECTED,
      feedback,
      actorUserId,
      expectedPostVersions,
    );
  }

  async requestChanges(
    batchId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
    expectedPostVersions?: Record<string, string>,
  ): Promise<IBatchSummary> {
    return this.reviewNegative(
      batchId,
      itemIds,
      orgId,
      ReviewDecision.REQUEST_CHANGES,
      feedback,
      actorUserId,
      expectedPostVersions,
    );
  }

  private async reviewNegative(
    batchId: string,
    itemIds: string[],
    orgId: string,
    decision:
      | typeof ReviewDecision.REJECTED
      | typeof ReviewDecision.REQUEST_CHANGES,
    feedback?: string,
    actorUserId?: string,
    expectedPostVersions?: Record<string, string>,
  ): Promise<IBatchSummary> {
    const changed: BatchItemFull[] = [];
    const updated = await this.withLockedBatch(
      batchId,
      orgId,
      async (transaction, batch) => {
        const items = resolveBatchItems(batch);
        this.assertExpectedPostSet(items, itemIds, expectedPostVersions);
        const reviewedAt = new Date().toISOString();
        for (const item of items) {
          if (
            !itemIds.includes(item.id) ||
            item.status !== BatchItemStatus.COMPLETED ||
            item.reviewDecision === decision
          )
            continue;
          if (item.postId) {
            const post = await transaction.post.findFirst({
              where: scopedWhere(orgId, { id: item.postId }),
            });
            if (
              !post ||
              post.targetExecutionState === TargetExecutionState.CANCELLED
            )
              continue;
            this.assertExpectedPostVersion(
              post.id,
              post.updatedAt,
              expectedPostVersions,
            );
            await this.autonomousPublishPolicy.recordReviewDecision(
              {
                organizationId: orgId,
                postId: item.postId,
                userId: actorUserId ?? batch.userId,
                decision,
                previousDecision: item.reviewDecision,
                generatedCaption: item.caption,
                hasRewriteHistory: Boolean(item.reviewEvents?.length),
              },
              transaction,
            );
            await this.publishApprovalsService.invalidatePost(
              orgId,
              item.postId,
              feedback ?? 'Review declined publication',
              actorUserId,
              transaction,
            );
            await this.postLifecycleService.transition(
              {
                actorId: actorUserId,
                organizationId: orgId,
                postId: item.postId,
                nextState:
                  decision === ReviewDecision.REJECTED
                    ? TargetExecutionState.CANCELLED
                    : TargetExecutionState.DRAFT,
                mutation: {
                  isDeleted: decision === ReviewDecision.REJECTED,
                  reviewDecision:
                    decision === ReviewDecision.REJECTED
                      ? PersistedReviewDecision.REJECTED
                      : PersistedReviewDecision.REQUEST_CHANGES,
                  reviewedAt: new Date(reviewedAt),
                  reviewFeedback: feedback,
                },
                reason: feedback ?? 'Review declined publication',
              },
              transaction,
            );
          }
          if (decision === ReviewDecision.REJECTED)
            item.status = BatchItemStatus.SKIPPED;
          item.reviewDecision = decision;
          item.reviewFeedback = feedback;
          item.reviewedAt = reviewedAt;
          item.reviewEvents = [
            ...(item.reviewEvents ?? []),
            {
              decision,
              feedback,
              reviewedAt,
              ...(actorUserId ? { reviewerId: actorUserId } : {}),
            },
          ];
          changed.push(item);
        }
        await writeBatchJsonAndItemRows(transaction, {
          batchId,
          brandId: batch.brandId,
          items,
          organizationId: orgId,
        });
        Object.assign(batch, { items, batchItems: undefined });
        return batch;
      },
    );
    this.recordHarnessReviewFeedback(
      changed,
      decision,
      orgId,
      updated.brandId ?? undefined,
      feedback,
    );
    return this.summaryService.toBatchSummary(updated);
  }

  async expireAutonomousReviewBatch(
    batchId: string,
    orgId: string,
    now = new Date(),
  ): Promise<string[]> {
    return this.withLockedBatch(batchId, orgId, async (transaction, batch) => {
      const items = resolveBatchItems(batch);
      const expired: string[] = [];
      for (const item of items) {
        if (
          !item.postId ||
          item.status !== BatchItemStatus.COMPLETED ||
          (item.reviewDecision && item.reviewDecision !== ReviewDecision.UNSET)
        )
          continue;
        const post = await transaction.post.findFirst({
          where: scopedWhere(orgId, {
            id: item.postId,
            targetExecutionState: TargetExecutionState.DRAFT,
            reviewDecision: null,
          }),
        });
        if (!post || (!post.agentStrategyId && !post.personaId)) continue;
        const policy = await this.autonomousPublishPolicy.resolveForPost(
          { organizationId: orgId, postId: post.id },
          transaction,
        );
        if (
          now.getTime() - post.createdAt.getTime() <
          policy.reviewTimeoutHours * 3_600_000
        )
          continue;
        const reason = 'Autonomous draft expired while awaiting human review';
        await this.publishApprovalsService.invalidatePost(
          orgId,
          post.id,
          reason,
          undefined,
          transaction,
        );
        await this.postLifecycleService.transition(
          {
            organizationId: orgId,
            postId: post.id,
            nextState: TargetExecutionState.CANCELLED,
            mutation: { isDeleted: true, reviewFeedback: reason },
            reason,
          },
          transaction,
        );
        item.status = BatchItemStatus.SKIPPED;
        item.reviewDecision = ReviewDecision.REJECTED;
        item.reviewFeedback = reason;
        item.reviewedAt = now.toISOString();
        item.reviewEvents = [
          ...(item.reviewEvents ?? []),
          {
            decision: ReviewDecision.REJECTED,
            feedback: reason,
            reviewedAt: now.toISOString(),
          },
        ];
        if (post.agentStrategyId && post.brandId && post.platform) {
          await recordAgentReviewOutcome(transaction, {
            organizationId: orgId,
            brandId: post.brandId,
            strategyId: post.agentStrategyId,
            platform: post.platform,
            postId: post.id,
            userId: batch.userId,
            decisionId: `expired:${post.id}:${post.createdAt.toISOString()}`,
            autoPublishEnabled: false,
            approvalStreak: 0,
            expired: true,
            occurredAt: now,
          });
        }
        expired.push(post.id);
      }
      if (expired.length)
        await writeBatchJsonAndItemRows(transaction, {
          batchId,
          brandId: batch.brandId,
          items,
          organizationId: orgId,
        });
      return expired;
    });
  }

  private assertExpectedPostSet(
    items: BatchItemFull[],
    itemIds: string[],
    expected?: Record<string, string>,
  ): void {
    if (!expected) return;
    const selected = items.filter((item) => itemIds.includes(item.id));
    if (
      selected.length !== new Set(itemIds).size ||
      selected.some(
        (item) => !item.postId || !Object.hasOwn(expected, item.postId),
      )
    ) {
      throw new BadRequestException(
        'This review action no longer refers to the expected draft',
      );
    }
  }

  private assertExpectedPostVersion(
    postId: string,
    updatedAt: Date,
    expected?: Record<string, string>,
  ): void {
    if (
      expected &&
      (!Object.hasOwn(expected, postId) ||
        updatedAt.toISOString() !== expected[postId])
    ) {
      throw new BadRequestException(
        'This review action refers to an older draft version',
      );
    }
  }

  private async withLockedBatch<T>(
    batchId: string,
    orgId: string,
    operation: (
      transaction: Prisma.TransactionClient,
      batch: BatchWithConfig,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "batches" WHERE "id" = ${batchId} AND "organizationId" = ${orgId} AND "isDeleted" = false FOR UPDATE`,
      );
      const batch = await transaction.batch.findFirst({
        include: batchItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: batchId }),
      });
      if (!batch) throw new NotFoundException('Batch', batchId);
      const postIds = [
        ...new Set(
          resolveBatchItems(batch).flatMap((item) =>
            item.postId ? [item.postId] : [],
          ),
        ),
      ].sort();
      if (postIds.length)
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "posts" WHERE "id" IN (${Prisma.join(postIds)}) AND "organizationId" = ${orgId} AND "isDeleted" = false ORDER BY "id" FOR UPDATE`,
        );

      return operation(transaction, toBatchWithConfig(batch));
    });
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
    const updatedBatch = toBatchWithConfig(
      await findOrThrow(
        this.prisma.batch,
        {
          include: batchItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: batchId }),
        },
        'Batch',
        batchId,
      ),
    );

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
    const updatedBatch = toBatchWithConfig(
      await findOrThrow(
        this.prisma.batch,
        {
          include: batchItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: batchId }),
        },
        'Batch',
        batchId,
      ),
    );

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

    const updatedBatch = toBatchWithConfig(
      await findOrThrow(
        this.prisma.batch,
        {
          include: batchItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: batchId }),
        },
        'Batch',
        batchId,
      ),
    );

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
