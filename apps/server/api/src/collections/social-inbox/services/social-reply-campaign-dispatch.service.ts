/**
 * Social Reply Campaign Dispatch
 *
 * One tick sends at most one reply. Pacing lives in the delay of the next
 * enqueued tick, never in a sleep inside the worker, so a campaign occupies a
 * worker slot only for the duration of a single outbound call and survives a
 * restart with nothing but its database rows.
 */

import {
  dayWindowStart,
  decideThrottle,
  hourWindowStart,
  renderCampaignBody,
} from '@api/collections/social-inbox/services/social-reply-campaign.helpers';
import type {
  SocialReplyCampaign,
  SocialReplyCampaignDispatchRequest,
  SocialReplyCampaignDispatchResult,
} from '@api/collections/social-inbox/services/social-reply-campaign.types';
import {
  buildSocialReplyCampaignWorkflowDefinition,
  SOCIAL_REPLY_CAMPAIGN_ACTION_IDS,
} from '@api/collections/social-inbox/services/social-reply-campaign-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  SocialMessageType,
  SocialReplyCampaignRecipientStatus,
  SocialReplyCampaignStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

/**
 * Bounded per-recipient attempts before a transient provider error permanently
 * retires the row. Claim increments `attemptCount`, so the first send is
 * attempt 1 and the third failure is terminal.
 */
export const SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS = 3;

/**
 * How long a recipient may sit in DISPATCHING before a later tick treats the
 * claim as abandoned and returns it to PENDING.
 *
 * The claim is a status flip with no lease: a worker killed mid-send (crash,
 * OOM, redeploy) leaves the row DISPATCHING forever. Nothing reset it, and the
 * empty-roster branch refuses to complete a campaign while any row is
 * in-flight — so a single dead worker parked the campaign in a permanent
 * reschedule loop, never sending and never completing.
 *
 * Sized well above the longest plausible outbound call so a genuinely active
 * send is never reclaimed underneath itself; the send path is idempotent on
 * `messageId`, so an over-eager reclaim would be safe but wasteful.
 */
export const SOCIAL_REPLY_CAMPAIGN_DISPATCH_STALE_MS = 10 * 60 * 1000;

type ClaimResult =
  | { claimStartedAt: Date; kind: 'claimed'; recipientId: string }
  | { kind: 'empty' }
  | { kind: 'lost-race' };

type SocialReplyCampaignDispatchState = {
  body?: string;
  claimStartedAt?: string;
  conversationId?: string;
  error?: string;
  errorKind?: 'bad-request' | 'conflict' | 'provider';
  idempotencyKey?: string;
  messageId?: string;
  messageType?: 'dm' | 'reply';
  organizationId?: string;
  outboundMessageId?: string;
  outcome?: SocialReplyCampaignDispatchResult['outcome'];
  permanentError?: boolean;
  recipientId?: string;
  request: SocialReplyCampaignDispatchRequest;
  scheduleDelaySeconds?: number;
  startedAt: string;
  userId?: string;
  workflowRunId?: string;
};

@Injectable()
export class SocialReplyCampaignDispatchService implements OnModuleInit {
  private readonly logContext = 'SocialReplyCampaignDispatchService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.LOAD,
      (request) => this.loadCampaignAction(request),
    );
    this.workflowRunner.registerAction(
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.RECLAIM,
      (request) => this.reclaimAction(request),
    );
    this.workflowRunner.registerAction(
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.THROTTLE,
      (request) => this.throttleAction(request),
    );
    this.workflowRunner.registerAction(
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.CLAIM,
      (request) => this.claimAction(request),
    );
    this.workflowRunner.registerAction(
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.PREPARE,
      (request) => this.prepareAction(request),
    );
    this.workflowRunner.registerAction(
      SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.FINALIZE,
      (request) => this.finalizeAction(request),
    );
  }

  async dispatchTick(
    data: SocialReplyCampaignDispatchRequest,
  ): Promise<SocialReplyCampaignDispatchResult> {
    const definition = buildSocialReplyCampaignWorkflowDefinition();
    const { result } =
      await this.workflowRunner.runWorkflow<SocialReplyCampaignDispatchResult>({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: data },
        organizationId: data.organizationId,
        source: 'SocialReplyCampaignDispatchService.dispatchTick',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      });
    return result;
  }

  private async loadCampaignAction(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialReplyCampaignDispatchState> {
    const request = this.readDispatchRequest(action.input);
    const campaign = await this.prisma.socialReplyCampaign.findFirst({
      where: scopedWhere(request.organizationId, { id: request.campaignId }),
    });
    if (
      !campaign ||
      campaign.status !== SocialReplyCampaignStatus.RUNNING ||
      campaign.dispatchCursor !== request.dispatchCursor
    ) {
      return {
        outcome: 'campaign-inactive',
        request,
        startedAt: new Date().toISOString(),
      };
    }
    return { request, startedAt: new Date().toISOString() };
  }

  private async reclaimAction(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialReplyCampaignDispatchState> {
    const state = this.readDispatchState(action.input);
    if (state.outcome) return state;
    await this.reclaimStaleDispatches(
      await this.requireCampaign(state),
      new Date(state.startedAt),
    );
    return state;
  }

  private async throttleAction(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialReplyCampaignDispatchState> {
    const state = this.readDispatchState(action.input);
    if (state.outcome) return state;
    const campaign = await this.requireCampaign(state);
    const throttle = await this.evaluateThrottle(
      campaign,
      new Date(state.startedAt),
    );
    return throttle.delaySeconds > 0
      ? {
          ...state,
          outcome: 'throttled',
          scheduleDelaySeconds: throttle.delaySeconds,
        }
      : state;
  }

  private async claimAction(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialReplyCampaignDispatchState> {
    const state = this.readDispatchState(action.input);
    if (state.outcome) return state;
    const campaign = await this.requireCampaign(state);
    const claim = await this.claimNextRecipient(
      campaign,
      new Date(state.startedAt),
    );
    if (claim.kind === 'lost-race') {
      return {
        ...state,
        outcome: 'recipient-skipped',
        scheduleDelaySeconds: 0,
      };
    }
    if (claim.kind === 'empty') {
      const inFlight = await this.prisma.socialReplyCampaignRecipient.count({
        where: scopedWhere(campaign.organizationId, {
          campaignId: campaign.id,
          status: SocialReplyCampaignRecipientStatus.DISPATCHING,
        }),
      });
      return inFlight > 0
        ? {
            ...state,
            outcome: 'throttled',
            scheduleDelaySeconds: campaign.minDelaySeconds,
          }
        : { ...state, outcome: 'campaign-completed' };
    }
    return {
      ...state,
      claimStartedAt: claim.claimStartedAt.toISOString(),
      recipientId: claim.recipientId,
    };
  }

  private async prepareAction(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialReplyCampaignDispatchState> {
    const state = this.readDispatchState(action.input);
    if (state.outcome) return state;
    const campaign = await this.requireCampaign(state);
    const recipientId = this.requiredString(state.recipientId, 'recipientId');
    const claimStartedAt = new Date(
      this.requiredString(state.claimStartedAt, 'claimStartedAt'),
    );
    const recipient = await this.prisma.socialReplyCampaignRecipient.findFirst({
      where: scopedWhere(campaign.organizationId, {
        dispatchedAt: claimStartedAt,
        id: recipientId,
        status: SocialReplyCampaignRecipientStatus.DISPATCHING,
      }),
    });
    if (!recipient) {
      return {
        ...state,
        outcome: 'recipient-skipped',
        scheduleDelaySeconds: 0,
      };
    }
    const conversation = await this.prisma.socialConversation.findFirst({
      where: scopedWhere(campaign.organizationId, {
        id: recipient.conversationId,
      }),
    });
    if (!conversation) {
      await this.markSkipped(
        campaign,
        recipientId,
        claimStartedAt,
        'Conversation is no longer available',
      );
      return {
        ...state,
        outcome: 'recipient-skipped',
        scheduleDelaySeconds: 0,
      };
    }
    return {
      ...state,
      body: renderCampaignBody(campaign.bodyTemplate, {
        handle: conversation.participantHandle,
        name: conversation.participantName,
      }),
      conversationId: recipient.conversationId,
      idempotencyKey: recipient.idempotencyKey,
      messageType:
        campaign.messageType === SocialMessageType.DM ? 'dm' : 'reply',
      organizationId: campaign.organizationId,
      ...(campaign.userId ? { userId: campaign.userId } : {}),
      workflowRunId: action.provenance.executionId,
    };
  }

  private async finalizeAction(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialReplyCampaignDispatchResult> {
    const state = this.readDispatchState(action.input);
    const campaign = await this.findCampaign(state);
    if (!campaign) return { outcome: 'campaign-inactive' };
    const now = new Date(state.startedAt);
    if (state.outcome === 'campaign-completed') {
      await this.completeCampaign(campaign);
      return { outcome: state.outcome };
    }
    if (state.outcome) {
      if (state.scheduleDelaySeconds !== undefined) {
        await this.scheduleNext(campaign, state.scheduleDelaySeconds, now);
      }
      return {
        ...(state.scheduleDelaySeconds !== undefined
          ? { nextRunInSeconds: state.scheduleDelaySeconds }
          : {}),
        outcome: state.outcome,
        ...(state.recipientId ? { recipientId: state.recipientId } : {}),
      };
    }
    const recipientId = this.requiredString(state.recipientId, 'recipientId');
    const claimStartedAt = new Date(
      this.requiredString(state.claimStartedAt, 'claimStartedAt'),
    );
    const messageId = state.outboundMessageId ?? state.messageId;
    if (messageId && !state.error) {
      await this.markSent(
        campaign,
        recipientId,
        claimStartedAt,
        messageId,
        this.requiredString(state.body, 'body'),
      );
      await this.scheduleNext(campaign, campaign.minDelaySeconds, now);
      return { outcome: 'recipient-sent', recipientId };
    }
    const reason = state.error ?? 'Dispatch failed';
    if (state.errorKind === 'bad-request' || state.permanentError) {
      await this.markSkipped(campaign, recipientId, claimStartedAt, reason);
      await this.scheduleNext(campaign, 0, now);
      return { outcome: 'recipient-skipped', recipientId };
    }
    const recipient = await this.prisma.socialReplyCampaignRecipient.findFirst({
      where: scopedWhere(campaign.organizationId, { id: recipientId }),
    });
    if (
      recipient &&
      recipient.attemptCount < SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS
    ) {
      await this.requeueRecipient(
        campaign,
        recipientId,
        claimStartedAt,
        reason,
      );
    } else {
      await this.markFailed(campaign, recipientId, claimStartedAt, reason);
    }
    await this.scheduleNext(campaign, campaign.minDelaySeconds, now);
    return { outcome: 'recipient-failed', recipientId };
  }

  private readDispatchRequest(
    input: Record<string, unknown>,
  ): SocialReplyCampaignDispatchRequest {
    const request = this.readRecord(input.request);
    return {
      campaignId: this.requiredString(request.campaignId, 'campaignId'),
      dispatchCursor:
        typeof request.dispatchCursor === 'number' ? request.dispatchCursor : 0,
      organizationId: this.requiredString(
        request.organizationId,
        'organizationId',
      ),
    };
  }

  private readDispatchState(
    input: Record<string, unknown>,
  ): SocialReplyCampaignDispatchState {
    const state = this.readRecord(input.state);
    return (
      Object.keys(state).length > 0 ? state : input
    ) as SocialReplyCampaignDispatchState;
  }

  private async findCampaign(
    state: SocialReplyCampaignDispatchState,
  ): Promise<SocialReplyCampaign | null> {
    return this.prisma.socialReplyCampaign.findFirst({
      where: scopedWhere(state.request.organizationId, {
        id: state.request.campaignId,
      }),
    });
  }

  private async requireCampaign(
    state: SocialReplyCampaignDispatchState,
  ): Promise<SocialReplyCampaign> {
    const campaign = await this.findCampaign(state);
    if (!campaign || campaign.status !== SocialReplyCampaignStatus.RUNNING) {
      throw new Error(
        `Social reply campaign ${state.request.campaignId} is inactive`,
      );
    }
    return campaign;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Social reply campaign action requires ${field}`);
    }
    return value;
  }

  /**
   * Rate-limit state is recomputed from persisted `sentAt` values every tick,
   * so nothing has to be carried across a restart or a redeploy.
   */
  private async evaluateThrottle(
    campaign: SocialReplyCampaign,
    now: Date,
  ): Promise<{ delaySeconds: number }> {
    const dayStart = dayWindowStart(now);
    const hourStart = hourWindowStart(now);

    const sends = await this.prisma.socialReplyCampaignRecipient.findMany({
      orderBy: { sentAt: 'asc' },
      select: { sentAt: true },
      where: scopedWhere(campaign.organizationId, {
        campaignId: campaign.id,
        sentAt: { gte: dayStart },
        status: SocialReplyCampaignRecipientStatus.SENT,
      }),
    });

    const sentAts = sends
      .map((row) => row.sentAt)
      .filter((value): value is Date => value !== null);
    const inHour = sentAts.filter((value) => value >= hourStart);

    return decideThrottle({
      dailyCount: sentAts.length,
      hourlyCount: inHour.length,
      lastSentAt: sentAts.at(-1) ?? null,
      maxPerDay: campaign.maxPerDay,
      maxPerHour: campaign.maxPerHour,
      minDelaySeconds: campaign.minDelaySeconds,
      now,
      oldestInDayAt: sentAts.at(0) ?? null,
      oldestInHourAt: inHour.at(0) ?? null,
    });
  }

  /**
   * Release claims whose worker never came back.
   *
   * `DISPATCHING` is a claim with no lease, and every terminal transition
   * (`markSent`/`markSkipped`/`markFailed`/`requeueRecipient`) requires the row
   * to still be `DISPATCHING` — so a worker that dies mid-send leaves the row
   * in that state permanently. The empty-roster branch below then sees a
   * non-zero in-flight count forever and reschedules without ever sending or
   * completing.
   *
   * Runs before the claim so a reclaimed row is candidate again in the same
   * tick. The two updates partition on `attemptCount`, so a recipient that has
   * already burned its budget retires instead of cycling back into the queue.
   */
  private async reclaimStaleDispatches(
    campaign: SocialReplyCampaign,
    now: Date,
  ): Promise<void> {
    const reason = 'Dispatch abandoned before completion';
    const staleWhere = {
      campaignId: campaign.id,
      dispatchedAt: {
        lt: new Date(now.getTime() - SOCIAL_REPLY_CAMPAIGN_DISPATCH_STALE_MS),
      },
      status: SocialReplyCampaignRecipientStatus.DISPATCHING,
    };

    const { requeued, retired } = await this.prisma.$transaction(async (tx) => {
      const retiredResult = await tx.socialReplyCampaignRecipient.updateMany({
        data: {
          failureReason: reason,
          status: SocialReplyCampaignRecipientStatus.FAILED,
        },
        where: scopedWhere(campaign.organizationId, {
          ...staleWhere,
          attemptCount: { gte: SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS },
        }),
      });

      const requeuedResult = await tx.socialReplyCampaignRecipient.updateMany({
        data: {
          failureReason: reason,
          status: SocialReplyCampaignRecipientStatus.PENDING,
        },
        where: scopedWhere(campaign.organizationId, {
          ...staleWhere,
          attemptCount: { lt: SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS },
        }),
      });

      if (retiredResult.count > 0) {
        await tx.socialReplyCampaign.updateMany({
          data: {
            failedCount: { increment: retiredResult.count },
            lastError: reason,
          },
          where: scopedWhere(campaign.organizationId, {
            id: campaign.id,
            status: SocialReplyCampaignStatus.RUNNING,
          }),
        });
      }

      return { requeued: requeuedResult, retired: retiredResult };
    });

    if (retired.count === 0 && requeued.count === 0) {
      return;
    }

    this.logger.warn(`${this.logContext} reclaimed stale dispatches`, {
      campaignId: campaign.id,
      requeued: requeued.count,
      retired: retired.count,
    });
  }

  /**
   * Claim-by-update: the `updateMany` count is the claim. Two workers racing
   * the same recipient cannot both win, so a duplicated job never doubles a
   * send even before the message-level idempotency key is consulted.
   *
   * Returns a discriminated result so a lost race is never confused with an
   * empty roster (which would complete the campaign and drop remaining rows).
   */
  private async claimNextRecipient(
    campaign: SocialReplyCampaign,
    now: Date,
  ): Promise<ClaimResult> {
    const candidate = await this.prisma.socialReplyCampaignRecipient.findFirst({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
      where: scopedWhere(campaign.organizationId, {
        campaignId: campaign.id,
        status: SocialReplyCampaignRecipientStatus.PENDING,
      }),
    });

    if (!candidate) {
      return { kind: 'empty' };
    }

    const claimed = await this.prisma.socialReplyCampaignRecipient.updateMany({
      data: {
        attemptCount: { increment: 1 },
        dispatchedAt: now,
        status: SocialReplyCampaignRecipientStatus.DISPATCHING,
      },
      where: scopedWhere(campaign.organizationId, {
        id: candidate.id,
        status: SocialReplyCampaignRecipientStatus.PENDING,
      }),
    });

    return claimed.count === 1
      ? { claimStartedAt: now, kind: 'claimed', recipientId: candidate.id }
      : { kind: 'lost-race' };
  }

  private async markSent(
    campaign: SocialReplyCampaign,
    recipientId: string,
    claimStartedAt: Date,
    messageId: string,
    body: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.socialReplyCampaignRecipient.updateMany({
        data: {
          body,
          failureReason: null,
          messageId,
          sentAt: new Date(),
          status: SocialReplyCampaignRecipientStatus.SENT,
        },
        where: scopedWhere(campaign.organizationId, {
          dispatchedAt: claimStartedAt,
          id: recipientId,
          status: SocialReplyCampaignRecipientStatus.DISPATCHING,
        }),
      });
      if (transitioned.count !== 1) {
        return;
      }
      await tx.socialReplyCampaign.updateMany({
        data: {
          lastDispatchedAt: new Date(),
          lastError: null,
          sentCount: { increment: 1 },
        },
        where: scopedWhere(campaign.organizationId, {
          id: campaign.id,
          status: SocialReplyCampaignStatus.RUNNING,
        }),
      });
    });
  }

  private async markSkipped(
    campaign: SocialReplyCampaign,
    recipientId: string,
    claimStartedAt: Date,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.socialReplyCampaignRecipient.updateMany({
        data: {
          failureReason: reason,
          status: SocialReplyCampaignRecipientStatus.SKIPPED,
        },
        where: scopedWhere(campaign.organizationId, {
          dispatchedAt: claimStartedAt,
          id: recipientId,
          status: SocialReplyCampaignRecipientStatus.DISPATCHING,
        }),
      });
      if (transitioned.count !== 1) {
        return;
      }
      await tx.socialReplyCampaign.updateMany({
        data: { skippedCount: { increment: 1 } },
        where: scopedWhere(campaign.organizationId, {
          id: campaign.id,
          status: SocialReplyCampaignStatus.RUNNING,
        }),
      });
    });
  }

  /**
   * Return a recipient to the pending queue after a retryable failure so a
   * later tick can re-claim it. Does not bump `failedCount` — only terminal
   * failures do.
   */
  private async requeueRecipient(
    campaign: SocialReplyCampaign,
    recipientId: string,
    claimStartedAt: Date,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.socialReplyCampaignRecipient.updateMany({
        data: {
          failureReason: reason,
          status: SocialReplyCampaignRecipientStatus.PENDING,
        },
        where: scopedWhere(campaign.organizationId, {
          dispatchedAt: claimStartedAt,
          id: recipientId,
          status: SocialReplyCampaignRecipientStatus.DISPATCHING,
        }),
      });
      if (transitioned.count !== 1) {
        return;
      }
      await tx.socialReplyCampaign.updateMany({
        data: {
          lastError: reason.slice(0, 500),
        },
        where: scopedWhere(campaign.organizationId, {
          id: campaign.id,
          status: SocialReplyCampaignStatus.RUNNING,
        }),
      });
    });
  }

  private async markFailed(
    campaign: SocialReplyCampaign,
    recipientId: string,
    claimStartedAt: Date,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.socialReplyCampaignRecipient.updateMany({
        data: {
          failureReason: reason,
          status: SocialReplyCampaignRecipientStatus.FAILED,
        },
        where: scopedWhere(campaign.organizationId, {
          dispatchedAt: claimStartedAt,
          id: recipientId,
          status: SocialReplyCampaignRecipientStatus.DISPATCHING,
        }),
      });
      if (transitioned.count !== 1) {
        return;
      }
      await tx.socialReplyCampaign.updateMany({
        data: {
          failedCount: { increment: 1 },
          lastError: reason.slice(0, 500),
        },
        where: scopedWhere(campaign.organizationId, {
          id: campaign.id,
          status: SocialReplyCampaignStatus.RUNNING,
        }),
      });
    });
  }

  private async completeCampaign(campaign: SocialReplyCampaign): Promise<void> {
    // Only RUNNING → COMPLETED, and only when nothing is left to drain. A
    // concurrent cancel/pause owns the status otherwise.
    await this.prisma.socialReplyCampaign.updateMany({
      data: {
        completedAt: new Date(),
        nextRunAt: null,
        status: SocialReplyCampaignStatus.COMPLETED,
      },
      where: scopedWhere(campaign.organizationId, {
        id: campaign.id,
        status: SocialReplyCampaignStatus.RUNNING,
      }),
    });
  }

  /**
   * Always bump the cursor before enqueuing: the tick that is scheduling its
   * own successor is still `active` under its current job id, so reusing that
   * id would be refused as already queued and the campaign would stall.
   */
  private async scheduleNext(
    campaign: SocialReplyCampaign,
    delaySeconds: number,
    now: Date,
  ): Promise<void> {
    const dispatchCursor = campaign.dispatchCursor + 1;
    const updated = await this.prisma.socialReplyCampaign.updateMany({
      data: {
        dispatchCursor,
        nextRunAt: new Date(now.getTime() + delaySeconds * 1000),
      },
      where: scopedWhere(campaign.organizationId, {
        dispatchCursor: campaign.dispatchCursor,
        id: campaign.id,
        status: SocialReplyCampaignStatus.RUNNING,
      }),
    });

    // The campaign was paused or cancelled while this tick was running — the
    // lifecycle transition already owns what happens next. A concurrent tick
    // that already advanced the cursor also lands here; that is intentional.
    if (updated.count !== 1) {
      return;
    }

    // Keep the in-memory cursor in sync so a follow-up schedule in the same
    // tick (none today) would not re-use a stale value.
    campaign.dispatchCursor = dispatchCursor;

    const request: SocialReplyCampaignDispatchRequest = {
      campaignId: campaign.id,
      dispatchCursor,
      organizationId: campaign.organizationId,
    };
    const definition = buildSocialReplyCampaignWorkflowDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        metadata: { campaignId: campaign.id, dispatchCursor },
        organizationId: campaign.organizationId,
        source: 'social-reply-campaign-successor',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: campaign.userId ?? undefined,
      },
      `social-reply-campaign-${campaign.id}-${dispatchCursor}`,
      {
        delayMs: delaySeconds * 1000,
        replaceTerminalJob: true,
      },
    );
  }
}
