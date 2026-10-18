import {
  AgentArtifactReferenceService,
  PostLifecycleService,
  scopedWhere,
} from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { buildAgentReviewActivity } from '@api/services/notifications/workflow-notifications/workflow-outcome-activity';
import { TurboRunReviewLockService } from '@api/services/turbo-run/turbo-run-review-lock';
import { runLockedReviewTransaction } from '@api/services/turbo-run/turbo-run-review-transaction';
import {
  PersistedReviewDecision,
  ReviewDecision,
  TargetExecutionState,
  TurboRunItemStatus,
  TurboRunStatus,
} from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

type ApproveTurboRunItemsContext = {
  turboRunId: string;
  turboRunItems: TurboRunItemFull[];
  turboRunRecord: TurboRunWithConfig;
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
import { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import { UpdateTurboRunDto } from '@api/services/turbo-run/dto/update-turbo-run.dto';
import {
  type ReviewInboxSummary,
  resolveTurboRunItems,
  type TurboRunItemFull,
  type TurboRunWithConfig,
  toTurboRunWithConfig,
} from '@api/services/turbo-run/turbo-run.types';
import {
  declineReviewPost,
  linkReviewDestinationPosts,
  withdrawDestinationPosts,
} from '@api/services/turbo-run/turbo-run-destination-posts';
import {
  turboRunItemRowsInclude,
  writeTurboRunJsonAndItemRows,
} from '@api/services/turbo-run/turbo-run-item-rows';
import {
  appendApprovedReviewEvent,
  pinApprovedDrafts,
  scheduleApprovedReviewPost,
} from '@api/services/turbo-run/turbo-run-review-approval';
import {
  getSelectedPostIds,
  toReviewInboxItemSummary,
} from '@api/services/turbo-run/turbo-run-review-items.util';
import { withMediaAssessmentReasons } from '@api/services/turbo-run/turbo-run-review-media-assessment.util';
import {
  applyTurboRewrites,
  assertExpectedPostSet,
  assertExpectedPostVersion,
} from '@api/services/turbo-run/turbo-run-review-rewrite';
import { toPrismaTurboRunStatus } from '@api/services/turbo-run/turbo-run-status-prisma.mapper';
import { TurboRunSummaryService } from '@api/services/turbo-run/turbo-run-summary.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
@Injectable()
export class TurboRunReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly agentArtifactReferenceService: AgentArtifactReferenceService,
    private readonly postLifecycleService: PostLifecycleService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly summaryService: TurboRunSummaryService,
    private readonly autonomousPublishPolicy: AutonomousPublishPolicyService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly reviewLocks: TurboRunReviewLockService,
    @Optional()
    private readonly harnessReviewFeedbackService?: HarnessReviewFeedbackService,
  ) {}

  /**
   * Bootstrap/overview review counts for an org (or brand).
   *
   * Counts and recent ready items come from typed `turbo_run_items` columns —
   * `groupBy` for the counters and a capped `findMany` for the preview strip.
   * The previous path loaded every run JSON blob and filtered in JS.
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
      this.prisma.turboRunItem.groupBy({
        _count: { _all: true },
        by: ['status', 'reviewDecision'],
        where: itemWhere,
      }),
      this.prisma.turboRunItem.findMany({
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
        where: scopedWhere(orgId, {
          ...(brandId ? { brandId } : {}),
          reviewDecision: null,
          status: TurboRunItemStatus.COMPLETED,
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
        group.status === TurboRunItemStatus.PENDING ||
        group.status === TurboRunItemStatus.PROCESSING
      ) {
        pendingCount += count;
        continue;
      }
      if (
        group.status === TurboRunItemStatus.COMPLETED &&
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
      recentItems: await withMediaAssessmentReasons(
        readyRows.map((row) => toReviewInboxItemSummary(row)),
        orgId,
        this.autonomousPublishPolicy,
      ),
      rejectedCount,
    };
  }

  async getTurboRun(
    turboRunId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    const turboRun = toTurboRunWithConfig(
      await findOrThrow(
        this.prisma.turboRun,
        {
          include: turboRunItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: turboRunId }),
        },
        'Turbo run',
        turboRunId,
      ),
    );

    return this.summaryService.toTurboRunSummary(turboRun);
  }

  async getTurboRuns(
    orgId: string,
    query?: { status?: TurboRunStatus; limit?: number; offset?: number },
  ): Promise<{ items: ITurboRunSummary[]; total: number }> {
    const limit = Math.min(query?.limit ?? 20, 100);
    const offset = query?.offset ?? 0;

    const [turboRuns, total] = await Promise.all([
      this.prisma.turboRun.findMany({
        include: turboRunItemRowsInclude(orgId),
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        where: scopedWhere(orgId, {
          ...(query?.status
            ? { status: toPrismaTurboRunStatus(query.status) }
            : {}),
        }),
      }),
      this.prisma.turboRun.count({
        where: scopedWhere(orgId, {
          ...(query?.status
            ? { status: toPrismaTurboRunStatus(query.status) }
            : {}),
        }),
      }),
    ]);

    return {
      items: await this.summaryService.toTurboRunSummaries(
        turboRuns.map(toTurboRunWithConfig),
      ),
      total,
    };
  }

  async approveItems(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    createdByUserId: string,
    autonomous = false,
    expectedPostVersions?: Record<string, string>,
  ): Promise<ITurboRunSummary> {
    if (autonomous)
      await this.prejudgeAutonomousDrafts(turboRunId, itemIds, orgId);
    const updatedTurboRun = await this.withLockedTurboRun(
      turboRunId,
      orgId,
      async (transaction, turboRunRecord) => {
        const turboRunItems = resolveTurboRunItems(turboRunRecord);
        const itemIdSet = new Set(itemIds);
        assertExpectedPostSet(turboRunItems, itemIds, expectedPostVersions);
        return this.approveItemsInTransaction(transaction, {
          turboRunId,
          turboRunItems,
          turboRunRecord,
          createdByUserId,
          itemIdSet,
          orgId,
          autonomous,
          expectedPostVersions,
          reviewedAt: new Date().toISOString(),
          selectedPostIds: getSelectedPostIds(turboRunItems, itemIdSet),
        });
      },
    );

    this.logger.log(`Approved ${itemIds.length} items in run ${turboRunId}`, {
      turboRunId,
      itemCount: itemIds.length,
    });

    return this.summaryService.toTurboRunSummary(updatedTurboRun);
  }

  /**
   * Runs the brand Policy judge on each autonomous draft before the review
   * transaction opens, so its model call never holds the transaction's locks;
   * the transaction then reads the cached verdict.
   */
  private async prejudgeAutonomousDrafts(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
  ): Promise<void> {
    const turboRun = await this.prisma.turboRun.findFirst({
      include: turboRunItemRowsInclude(orgId),
      where: scopedWhere(orgId, { id: turboRunId }),
    });
    if (!turboRun) return;
    const items = resolveTurboRunItems(toTurboRunWithConfig(turboRun));
    for (const postId of getSelectedPostIds(items, new Set(itemIds)))
      await this.autonomousPublishPolicy.resolveForPost({
        organizationId: orgId,
        postId,
        qualityScore: items.find((item) => item.postId === postId)
          ?.gateOverallScore,
      });
  }

  private async approveItemsInTransaction(
    transaction: Prisma.TransactionClient,
    params: ApproveTurboRunItemsContext,
  ): Promise<TurboRunWithConfig> {
    const {
      turboRunId,
      turboRunItems,
      turboRunRecord,
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
      assertExpectedPostVersion,
      autonomous,
      autonomousPublishPolicy: this.autonomousPublishPolicy,
      turboRunId,
      turboRunItems,
      turboRunRecord,
      createdByUserId,
      expectedPostVersions,
      orgId,
      publishApprovalsService: this.publishApprovalsService,
      selectedPostIds,
      transaction,
    });

    const postIdsToSchedule: string[] = [];

    for (const item of turboRunItems) {
      if (
        itemIdSet.has(item.id) &&
        item.status === TurboRunItemStatus.COMPLETED &&
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
      await scheduleApprovedReviewPost({
        turboRunId,
        createdByUserId,
        logger: this.logger,
        orgId,
        postId,
        postLifecycleService: this.postLifecycleService,
        reviewedAt,
        transaction,
        versionPinId: versionPinIds.get(postId),
      });
    }

    const batchUpdate = await writeTurboRunJsonAndItemRows(transaction, {
      turboRunId,
      brandId: turboRunRecord.brandId,
      items: turboRunItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException({
        message: `Turbo run ${turboRunId} disappeared before approval completed`,
      });
    }

    const updated = await transaction.turboRun.findFirst({
      include: turboRunItemRowsInclude(orgId),
      where: scopedWhere(orgId, { id: turboRunId }),
    });
    if (!updated) {
      throw new NotFoundException('Turbo run', turboRunId);
    }
    return toTurboRunWithConfig(updated);
  }

  /**
   * Feeds human rejections/change-requests on generated Turbo run items back
   * into the brand's harness profile (anti-examples) so future generations
   * avoid repeating the rejected pattern. Fire-and-forget: the harness
   * service never throws, but this is still not awaited so a slow or failed
   * feedback write can never delay or fail the review action itself.
   */
  private recordHarnessReviewFeedback(
    items: TurboRunItemFull[],
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
        sourceType: 'turbo_run_item',
      });
    }
  }

  async rejectItems(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
    expectedPostVersions?: Record<string, string>,
  ): Promise<ITurboRunSummary> {
    return this.reviewNegative(
      turboRunId,
      itemIds,
      orgId,
      ReviewDecision.REJECTED,
      feedback,
      actorUserId,
      expectedPostVersions,
    );
  }

  async requestChanges(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    feedback?: string,
    actorUserId?: string,
    expectedPostVersions?: Record<string, string>,
  ): Promise<ITurboRunSummary> {
    return this.reviewNegative(
      turboRunId,
      itemIds,
      orgId,
      ReviewDecision.REQUEST_CHANGES,
      feedback,
      actorUserId,
      expectedPostVersions,
    );
  }

  private async reviewNegative(
    turboRunId: string,
    itemIds: string[],
    orgId: string,
    decision:
      | typeof ReviewDecision.REJECTED
      | typeof ReviewDecision.REQUEST_CHANGES,
    feedback?: string,
    actorUserId?: string,
    expectedPostVersions?: Record<string, string>,
  ): Promise<ITurboRunSummary> {
    const changed: TurboRunItemFull[] = [];
    const updated = await this.withLockedTurboRun(
      turboRunId,
      orgId,
      async (transaction, turboRun) => {
        const items = resolveTurboRunItems(turboRun);
        assertExpectedPostSet(items, itemIds, expectedPostVersions);
        const reviewedAt = new Date().toISOString();
        for (const item of items) {
          if (
            !itemIds.includes(item.id) ||
            item.status !== TurboRunItemStatus.COMPLETED ||
            item.reviewDecision === decision
          )
            continue;
          await withdrawDestinationPosts({
            actorUserId,
            decision,
            item,
            organizationId: orgId,
            postLifecycleService: this.postLifecycleService,
            publishApprovalsService: this.publishApprovalsService,
            reason: feedback ?? 'Review declined publication',
            transaction,
          });
          if (item.postId) {
            const post = await transaction.post.findFirst({
              where: scopedWhere(orgId, { id: item.postId }),
            });
            if (
              !post ||
              post.targetExecutionState === TargetExecutionState.CANCELLED
            )
              continue;
            assertExpectedPostVersion(
              post.id,
              post.updatedAt,
              expectedPostVersions,
            );
            await declineReviewPost({
              actorUserId,
              autonomousPublishPolicy: this.autonomousPublishPolicy,
              decision,
              feedback,
              item,
              organizationId: orgId,
              postId: post.id,
              postLifecycleService: this.postLifecycleService,
              publishApprovalsService: this.publishApprovalsService,
              reviewedAt,
              transaction,
              userId: turboRun.userId,
            });
          }
          if (decision === ReviewDecision.REJECTED)
            item.status = TurboRunItemStatus.SKIPPED;
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
        await writeTurboRunJsonAndItemRows(transaction, {
          turboRunId,
          brandId: turboRun.brandId,
          items,
          organizationId: orgId,
        });
        Object.assign(turboRun, { items, turboRunItems: undefined });
        return turboRun;
      },
    );
    this.recordHarnessReviewFeedback(
      changed,
      decision,
      orgId,
      updated.brandId ?? undefined,
      feedback,
    );
    return this.summaryService.toTurboRunSummary(updated);
  }

  /** Link additional destination posts so review decisions reach every account. */
  async linkDestinationPosts(
    turboRunId: string,
    itemId: string,
    postIds: string[],
    orgId: string,
  ): Promise<void> {
    await this.withLockedTurboRun(
      turboRunId,
      orgId,
      async (transaction, turboRun) => {
        await linkReviewDestinationPosts(
          transaction,
          turboRun,
          itemId,
          postIds,
          orgId,
        );
      },
    );
  }

  async expireAutonomousReviewTurboRun(
    turboRunId: string,
    orgId: string,
    now = new Date(),
  ): Promise<string[]> {
    return this.withLockedTurboRun(
      turboRunId,
      orgId,
      async (transaction, turboRun) => {
        const items = resolveTurboRunItems(turboRun);
        const expired: string[] = [];
        for (const item of items) {
          if (
            !item.postId ||
            item.status !== TurboRunItemStatus.COMPLETED ||
            (item.reviewDecision &&
              item.reviewDecision !== ReviewDecision.UNSET)
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
          const reviewTimeoutHours =
            await this.autonomousPublishPolicy.resolveReviewTimeoutHours(
              orgId,
              post.agentStrategyId,
              transaction,
            );
          if (
            now.getTime() - post.createdAt.getTime() <
            reviewTimeoutHours * 3_600_000
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
          item.status = TurboRunItemStatus.SKIPPED;
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
          const review =
            post.agentStrategyId && post.brandId && post.platform
              ? await buildAgentReviewActivity(transaction, {
                  organizationId: orgId,
                  brandId: post.brandId,
                  strategyId: post.agentStrategyId,
                  platform: post.platform,
                  postId: post.id,
                  userId: turboRun.userId,
                  decisionId: `expired:${post.id}:${post.createdAt.toISOString()}`,
                  autoPublishEnabled: false,
                  approvalStreak: 0,
                  expired: true,
                  occurredAt: now,
                })
              : null;
          // Committed with the run; the delivery sweep sends the email.
          if (review)
            await this.activityRecorder.recordInTransaction(
              transaction,
              review,
            );
          expired.push(post.id);
        }
        if (expired.length)
          await writeTurboRunJsonAndItemRows(transaction, {
            turboRunId,
            brandId: turboRun.brandId,
            items,
            organizationId: orgId,
          });
        return expired;
      },
    );
  }

  async applyRewrites(
    turboRunId: string,
    organizationId: string,
    userId: string,
    captions: Map<string, string>,
    postVersions: Map<string, Date>,
    rewriteJobId?: string,
  ): Promise<ITurboRunSummary> {
    const updated = await this.withLockedTurboRun(
      turboRunId,
      organizationId,
      (transaction, turboRun) =>
        applyTurboRewrites({
          autonomousPublishPolicy: this.autonomousPublishPolicy,
          turboRun,
          turboRunId,
          captions,
          organizationId,
          postLifecycleService: this.postLifecycleService,
          postVersions,
          publishApprovalsService: this.publishApprovalsService,
          rewriteJobId,
          transaction,
          userId,
        }),
    );
    return this.getTurboRun(updated.id, organizationId);
  }

  private async withLockedTurboRun<T>(
    turboRunId: string,
    orgId: string,
    operation: (
      transaction: Prisma.TransactionClient,
      turboRun: TurboRunWithConfig,
    ) => Promise<T>,
  ): Promise<T> {
    return runLockedReviewTransaction(
      this.prisma,
      this.reviewLocks,
      turboRunId,
      orgId,
      operation,
    );
  }

  async assignItem(
    turboRunId: string,
    itemId: string,
    assigneeId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    await this.assertAssignableOrgMember(orgId, assigneeId);
    return this.setItemAssignee(turboRunId, itemId, orgId, assigneeId);
  }

  async unassignItem(
    turboRunId: string,
    itemId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    return this.setItemAssignee(turboRunId, itemId, orgId, null);
  }

  async cancelTurboRun(
    turboRunId: string,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    const turboRunRecord = await findOrThrow(
      this.prisma.turboRun,
      {
        include: turboRunItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: turboRunId }),
      },
      'Turbo run',
      turboRunId,
    );

    const turboRunItems = resolveTurboRunItems(turboRunRecord).map((item) => ({
      ...item,
      status:
        item.status === TurboRunItemStatus.PENDING
          ? TurboRunItemStatus.SKIPPED
          : item.status,
    }));

    const batchUpdate = await writeTurboRunJsonAndItemRows(this.prisma, {
      turboRunId,
      brandId: turboRunRecord.brandId,
      extraTurboRunData: {
        status: toPrismaTurboRunStatus(TurboRunStatus.CANCELLED),
      },
      items: turboRunItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Turbo run', turboRunId);
    }
    const updatedTurboRun = toTurboRunWithConfig(
      await findOrThrow(
        this.prisma.turboRun,
        {
          include: turboRunItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: turboRunId }),
        },
        'Turbo run',
        turboRunId,
      ),
    );

    this.logger.log(`Turbo run cancelled: ${turboRunId}`, { turboRunId });

    return this.summaryService.toTurboRunSummary(updatedTurboRun);
  }

  /**
   * Update a run by ID. Status transitions to CANCELLED are routed
   * through cancelTurboRun() to preserve its guard (tenant-scoped existence
   * check via findOrThrow) and cascade (marking pending items as skipped).
   */
  async updateTurboRun(
    turboRunId: string,
    dto: UpdateTurboRunDto,
    orgId: string,
  ): Promise<ITurboRunSummary> {
    if (dto.status === TurboRunStatus.CANCELLED) {
      return this.cancelTurboRun(turboRunId, orgId);
    }

    const turboRunRecord = await findOrThrow(
      this.prisma.turboRun,
      {
        include: turboRunItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: turboRunId }),
      },
      'Turbo run',
      turboRunId,
    );

    const batchUpdate = await this.prisma.turboRun.updateMany({
      data: {
        ...(dto.status ? { status: toPrismaTurboRunStatus(dto.status) } : {}),
      },
      where: scopedWhere(orgId, { id: turboRunRecord.id }),
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Turbo run', turboRunId);
    }
    const updatedTurboRun = toTurboRunWithConfig(
      await findOrThrow(
        this.prisma.turboRun,
        {
          include: turboRunItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: turboRunId }),
        },
        'Turbo run',
        turboRunId,
      ),
    );

    return this.summaryService.toTurboRunSummary(updatedTurboRun);
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
    turboRunId: string,
    itemId: string,
    orgId: string,
    assigneeId: string | null,
  ): Promise<ITurboRunSummary> {
    const turboRunRecord = await findOrThrow(
      this.prisma.turboRun,
      {
        include: turboRunItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: turboRunId }),
      },
      'Turbo run',
      turboRunId,
    );

    const turboRunItems = resolveTurboRunItems(turboRunRecord);
    const target = turboRunItems.find((item) => item.id === itemId);
    if (!target) {
      throw new NotFoundException('Turbo run item', itemId);
    }

    target.assigneeId = assigneeId;

    const batchUpdate = await writeTurboRunJsonAndItemRows(this.prisma, {
      turboRunId,
      brandId: turboRunRecord.brandId,
      items: turboRunItems,
      organizationId: orgId,
    });
    if (batchUpdate.count !== 1) {
      throw new NotFoundException('Turbo run', turboRunId);
    }

    const updatedTurboRun = toTurboRunWithConfig(
      await findOrThrow(
        this.prisma.turboRun,
        {
          include: turboRunItemRowsInclude(orgId),
          where: scopedWhere(orgId, { id: turboRunId }),
        },
        'Turbo run',
        turboRunId,
      ),
    );

    this.logger.log(
      assigneeId
        ? `Assigned item ${itemId} in run ${turboRunId}`
        : `Unassigned item ${itemId} in run ${turboRunId}`,
      {
        assigneeId,
        turboRunId,
        itemId,
      },
    );

    return this.summaryService.toTurboRunSummary(updatedTurboRun);
  }
}
