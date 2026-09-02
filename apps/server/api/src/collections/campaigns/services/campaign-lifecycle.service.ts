import {
  campaignItemOutcome,
  canApplyContentCampaignLifecycle,
  toCampaign,
} from '@api/collections/campaigns/services/campaign.utils';
import { bindScheduledPublishApproval } from '@api/collections/posts/services/post-schedule-approval.util';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PostLifecycleService, scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
  parseReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ICampaignLifecycleItemOutcome,
  ICampaignLifecycleResult,
} from '@genfeedai/contracts/interfaces';
import type { Campaign, Post } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';

const IN_FLIGHT_STATES = new Set<string>([TargetExecutionState.PUBLISHING]);
const TERMINAL_UNCHANGED_STATES = new Set<string>([
  TargetExecutionState.CANCELLED,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.SKIPPED,
]);

@Injectable()
export class CampaignLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postLifecycleService: PostLifecycleService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly scheduledPostWorkflowQueue: ScheduledPostWorkflowQueueService,
  ) {}

  start(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<ICampaignLifecycleResult> {
    return this.run(
      organizationId,
      userId,
      id,
      ContentCampaignLifecycleAction.START,
    );
  }

  pause(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<ICampaignLifecycleResult> {
    return this.run(
      organizationId,
      userId,
      id,
      ContentCampaignLifecycleAction.PAUSE,
    );
  }

  complete(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<ICampaignLifecycleResult> {
    return this.run(
      organizationId,
      userId,
      id,
      ContentCampaignLifecycleAction.COMPLETE,
    );
  }

  private async run(
    organizationId: string,
    userId: string,
    id: string,
    action: ContentCampaignLifecycleAction,
  ): Promise<ICampaignLifecycleResult> {
    const campaign = await this.requireCampaign(organizationId, id);
    const status = campaign.status as ContentCampaignStatus;
    if (!canApplyContentCampaignLifecycle(status, action)) {
      throw new BadRequestException(
        `Campaign '${id}' cannot ${action} from ${status}`,
      );
    }

    const posts = await this.prisma.post.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: scopedWhere(organizationId, {
        brandId: campaign.brandId,
        campaignId: campaign.id,
        parentId: null,
      }),
    });

    const items: ICampaignLifecycleItemOutcome[] = [];
    for (const post of posts) {
      items.push(await this.coordinatePost(action, campaign, post, userId));
    }

    const nextStatus = this.nextCampaignStatus(action);
    const updated =
      status === nextStatus
        ? campaign
        : await this.prisma.campaign.update({
            data: { status: nextStatus },
            where: scopedWhere(organizationId, { id: campaign.id }),
          });

    this.logger.log(`Campaign ${action} coordinated`, {
      action,
      campaignId: campaign.id,
      failedCount: items.filter(
        (item) => item.status === ContentCampaignItemOutcomeStatus.FAILED,
      ).length,
      itemCount: items.length,
      organizationId,
    });

    return {
      action,
      campaign: toCampaign(updated),
      id: updated.id,
      items,
    };
  }

  private async coordinatePost(
    action: ContentCampaignLifecycleAction,
    campaign: Campaign,
    post: Post,
    userId: string,
  ): Promise<ICampaignLifecycleItemOutcome> {
    try {
      if (action === ContentCampaignLifecycleAction.START) {
        return await this.startPost(campaign, post, userId);
      }
      if (action === ContentCampaignLifecycleAction.PAUSE) {
        return await this.pausePost(campaign, post, userId);
      }
      return await this.completePost(campaign, post, userId);
    } catch (error: unknown) {
      this.logger.warn('Campaign item coordination failed', {
        action,
        campaignId: campaign.id,
        error: getErrorMessage(error),
        postId: post.id,
      });
      return campaignItemOutcome({
        executionState: this.readExecutionState(post),
        id: post.id,
        reason: getErrorMessage(error),
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.FAILED,
      });
    }
  }

  private async startPost(
    campaign: Campaign,
    post: Post,
    userId: string,
  ): Promise<ICampaignLifecycleItemOutcome> {
    const executionState = this.readExecutionState(post);
    if (executionState === TargetExecutionState.SCHEDULED) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
      });
    }
    if (IN_FLIGHT_STATES.has(executionState)) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Already queued with the provider',
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      });
    }
    if (TERMINAL_UNCHANGED_STATES.has(executionState)) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason:
          executionState === TargetExecutionState.PUBLISHED
            ? 'Already published'
            : 'Target is no longer eligible',
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      });
    }
    if (!post.scheduledDate) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Post has no schedule',
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
      });
    }
    if (this.isReviewBlocked(post)) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Review is not approved',
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
      });
    }

    const nextState =
      executionState === TargetExecutionState.PAUSED ||
      executionState === TargetExecutionState.DRAFT ||
      executionState === TargetExecutionState.FAILED
        ? TargetExecutionState.SCHEDULED
        : null;
    if (!nextState) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: `Cannot start from ${executionState}`,
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
      });
    }

    const transitioned = await this.postLifecycleService.transition({
      actorId: userId,
      organizationId: campaign.organizationId,
      postId: post.id,
      nextState,
      reason: 'Campaign start',
    });
    if (transitioned.kind === 'stale') {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Post changed while starting the campaign',
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.FAILED,
      });
    }

    await bindScheduledPublishApproval({
      actorUserId: userId,
      post: {
        id: transitioned.target.id,
        organizationId: campaign.organizationId,
        parentId: transitioned.target.parentId,
        scheduledDate: transitioned.target.scheduledDate,
        targetExecutionState: transitioned.target.targetExecutionState,
        userId: transitioned.target.userId,
      },
      provenanceSurface: 'campaign-lifecycle',
      publishApprovalsService: this.publishApprovalsService,
      scheduledPostWorkflowQueue: this.scheduledPostWorkflowQueue,
    });

    return campaignItemOutcome({
      executionState: this.readExecutionState(transitioned.target),
      id: post.id,
      status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
    });
  }

  private async pausePost(
    campaign: Campaign,
    post: Post,
    userId: string,
  ): Promise<ICampaignLifecycleItemOutcome> {
    const executionState = this.readExecutionState(post);
    if (executionState === TargetExecutionState.PAUSED) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
      });
    }
    if (IN_FLIGHT_STATES.has(executionState)) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Already queued with the provider',
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      });
    }
    if (executionState === TargetExecutionState.PUBLISHED) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Already published',
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      });
    }
    if (executionState !== TargetExecutionState.SCHEDULED) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: `Cannot pause from ${executionState}`,
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      });
    }

    const transitioned = await this.postLifecycleService.transition({
      actorId: userId,
      organizationId: campaign.organizationId,
      postId: post.id,
      nextState: TargetExecutionState.PAUSED,
      reason: 'Campaign pause',
    });
    if (transitioned.kind === 'stale') {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Post changed while pausing the campaign',
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.FAILED,
      });
    }

    return campaignItemOutcome({
      executionState: this.readExecutionState(transitioned.target),
      id: post.id,
      status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
    });
  }

  private async completePost(
    campaign: Campaign,
    post: Post,
    userId: string,
  ): Promise<ICampaignLifecycleItemOutcome> {
    const executionState = this.readExecutionState(post);
    if (
      IN_FLIGHT_STATES.has(executionState) ||
      executionState === TargetExecutionState.PUBLISHED
    ) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason:
          executionState === TargetExecutionState.PUBLISHED
            ? 'Already published'
            : 'Already queued with the provider',
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      });
    }
    if (
      executionState === TargetExecutionState.PAUSED ||
      executionState === TargetExecutionState.DRAFT ||
      executionState === TargetExecutionState.CANCELLED ||
      executionState === TargetExecutionState.SKIPPED
    ) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
      });
    }
    if (executionState !== TargetExecutionState.SCHEDULED) {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: `Cannot complete from ${executionState}`,
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      });
    }

    const transitioned = await this.postLifecycleService.transition({
      actorId: userId,
      organizationId: campaign.organizationId,
      postId: post.id,
      nextState: TargetExecutionState.PAUSED,
      reason: 'Campaign complete',
    });
    if (transitioned.kind === 'stale') {
      return campaignItemOutcome({
        executionState,
        id: post.id,
        reason: 'Post changed while completing the campaign',
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.FAILED,
      });
    }

    return campaignItemOutcome({
      executionState: this.readExecutionState(transitioned.target),
      id: post.id,
      status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
    });
  }

  private nextCampaignStatus(
    action: ContentCampaignLifecycleAction,
  ): ContentCampaignStatus {
    if (action === ContentCampaignLifecycleAction.START) {
      return ContentCampaignStatus.ACTIVE;
    }
    if (action === ContentCampaignLifecycleAction.PAUSE) {
      return ContentCampaignStatus.PAUSED;
    }
    return ContentCampaignStatus.COMPLETED;
  }

  private isReviewBlocked(post: Post): boolean {
    const decision = parseReviewDecision(post.reviewDecision).decision;
    return (
      decision === ReviewDecision.REJECTED ||
      decision === ReviewDecision.REQUEST_CHANGES
    );
  }

  private readExecutionState(
    post: Pick<Post, 'targetExecutionState'>,
  ): TargetExecutionState {
    return post.targetExecutionState as TargetExecutionState;
  }

  private async requireCampaign(
    organizationId: string,
    id: string,
  ): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(organizationId, { id }),
    });
    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }
    return campaign;
  }
}
