/**
 * Social Reply Campaign Dispatch
 *
 * One tick sends at most one reply. Pacing lives in the delay of the next
 * enqueued tick, never in a sleep inside the worker, so a campaign occupies a
 * worker slot only for the duration of a single outbound call and survives a
 * restart with nothing but its database rows.
 */
import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxActionService } from '@api/collections/social-inbox/services/social-inbox-action.service';
import {
  dayWindowStart,
  decideThrottle,
  hourWindowStart,
  renderCampaignBody,
} from '@api/collections/social-inbox/services/social-reply-campaign.helpers';
import type { SocialReplyCampaign } from '@api/collections/social-inbox/services/social-reply-campaign.types';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@server/collections/workflows/system-workflow-provenance.service';
import { SocialReplyCampaignQueueService } from '@api/queues/social-reply-campaign/social-reply-campaign-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  SocialMessageType,
  SocialReplyCampaignRecipientStatus,
  SocialReplyCampaignStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type {
  SocialReplyCampaignJobData,
  SocialReplyCampaignJobResult,
} from '@genfeedai/queue-contracts';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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

@Injectable()
export class SocialReplyCampaignDispatchService {
  private readonly logContext = 'SocialReplyCampaignDispatchService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionService: SocialInboxActionService,
    private readonly queueService: SocialReplyCampaignQueueService,
    private readonly provenanceService: SystemWorkflowProvenanceService,
    private readonly logger: LoggerService,
  ) {}

  async dispatchTick(
    data: SocialReplyCampaignJobData,
  ): Promise<SocialReplyCampaignJobResult> {
    const campaign = await this.prisma.socialReplyCampaign.findFirst({
      where: scopedWhere(data.organizationId, { id: data.campaignId }),
    });

    // A pause or cancel flips `status`, and a resume bumps `dispatchCursor`.
    // Either makes an already-delayed tick a no-op when it finally lands.
    if (!campaign || campaign.status !== SocialReplyCampaignStatus.RUNNING) {
      return { outcome: 'campaign-inactive' };
    }
    if (campaign.dispatchCursor !== data.dispatchCursor) {
      return { outcome: 'campaign-inactive' };
    }

    const now = new Date();
    await this.reclaimStaleDispatches(campaign, now);

    const throttle = await this.evaluateThrottle(campaign, now);
    if (throttle.delaySeconds > 0) {
      await this.scheduleNext(campaign, throttle.delaySeconds, now);
      return {
        nextRunInSeconds: throttle.delaySeconds,
        outcome: 'throttled',
      };
    }

    const claim = await this.claimNextRecipient(campaign, now);
    if (claim.kind === 'empty') {
      // Another worker may still be mid-send (DISPATCHING). Completing here
      // would strand that recipient if the worker dies after we finish.
      const inFlight = await this.prisma.socialReplyCampaignRecipient.count({
        where: scopedWhere(campaign.organizationId, {
          campaignId: campaign.id,
          status: SocialReplyCampaignRecipientStatus.DISPATCHING,
        }),
      });
      if (inFlight > 0) {
        await this.scheduleNext(campaign, campaign.minDelaySeconds, now);
        return {
          nextRunInSeconds: campaign.minDelaySeconds,
          outcome: 'throttled',
        };
      }

      await this.completeCampaign(campaign);
      return { outcome: 'campaign-completed' };
    }

    if (claim.kind === 'lost-race') {
      // Another tick took this recipient. Re-tick instead of treating the
      // roster as drained — that path used to complete the campaign early.
      await this.scheduleNext(campaign, 0, now);
      return { outcome: 'recipient-skipped' };
    }

    return this.sendToRecipient(
      campaign,
      claim.recipientId,
      claim.claimStartedAt,
      now,
    );
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

  private async sendToRecipient(
    campaign: SocialReplyCampaign,
    recipientId: string,
    claimStartedAt: Date,
    now: Date,
  ): Promise<SocialReplyCampaignJobResult> {
    const recipient = await this.prisma.socialReplyCampaignRecipient.findFirst({
      where: scopedWhere(campaign.organizationId, {
        dispatchedAt: claimStartedAt,
        id: recipientId,
        status: SocialReplyCampaignRecipientStatus.DISPATCHING,
      }),
    });
    if (!recipient) {
      // Claim won but the row vanished (soft-delete race). Keep draining.
      await this.scheduleNext(campaign, 0, now);
      return { outcome: 'recipient-skipped', recipientId };
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
      await this.scheduleNext(campaign, 0, now);
      return { outcome: 'recipient-skipped', recipientId };
    }

    const scope: SocialInboxScope = {
      brandId: campaign.brandId ?? undefined,
      organizationId: campaign.organizationId,
      userId: campaign.userId ?? undefined,
    };
    const body = renderCampaignBody(campaign.bodyTemplate, {
      handle: conversation.participantHandle,
      name: conversation.participantName,
    });

    try {
      const { result: message } = await this.provenanceService.runAction(
        {
          actionType: 'social-reply-campaign',
          canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SOCIAL_REPLY_CAMPAIGN,
          description:
            'Dispatches one throttled inbox reply or DM per tick, pacing a campaign across its rate-limit windows.',
          inputValues: {
            campaignId: campaign.id,
            conversationId: recipient.conversationId,
            messageType: campaign.messageType,
            platform: campaign.platform,
            recipientId,
          },
          label: 'Inbox Reply Campaign Dispatch',
          organizationId: campaign.organizationId,
          source: 'SocialReplyCampaignDispatchService.dispatchTick',
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          userId: campaign.userId ?? undefined,
        },
        (provenance) =>
          campaign.messageType === SocialMessageType.DM
            ? this.actionService.sendDm(scope, recipient.conversationId, {
                idempotencyKey: recipient.idempotencyKey,
                text: body,
                workflowRunId: provenance.executionId,
              })
            : this.actionService.postReply(scope, recipient.conversationId, {
                idempotencyKey: recipient.idempotencyKey,
                text: body,
                workflowRunId: provenance.executionId,
              }),
      );

      await this.markSent(
        campaign,
        recipientId,
        claimStartedAt,
        message.id,
        body,
      );
      await this.scheduleNext(campaign, campaign.minDelaySeconds, now);
      return { outcome: 'recipient-sent', recipientId };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Dispatch failed';

      // A `BadRequestException` means the platform will never accept this
      // conversation (reply window closed, DMs unsupported). Skipping keeps the
      // campaign draining instead of burning retries on a permanent refusal.
      if (error instanceof BadRequestException) {
        await this.markSkipped(campaign, recipientId, claimStartedAt, reason);
        await this.scheduleNext(campaign, 0, now);
        return { outcome: 'recipient-skipped', recipientId };
      }

      this.logger.error(`${this.logContext} dispatch failed`, {
        campaignId: campaign.id,
        error: reason,
        recipientId,
      });

      // Transient provider errors stay retryable until the attempt budget is
      // exhausted. Permanently retiring on the first 5xx left healthy rosters
      // half-drained after a blip.
      if (recipient.attemptCount < SOCIAL_REPLY_CAMPAIGN_MAX_ATTEMPTS) {
        await this.requeueRecipient(
          campaign,
          recipientId,
          claimStartedAt,
          reason,
        );
        await this.scheduleNext(campaign, campaign.minDelaySeconds, now);
        return { outcome: 'recipient-failed', recipientId };
      }

      await this.markFailed(campaign, recipientId, claimStartedAt, reason);
      await this.scheduleNext(campaign, campaign.minDelaySeconds, now);
      return { outcome: 'recipient-failed', recipientId };
    }
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

    await this.queueService.enqueueTick(
      {
        campaignId: campaign.id,
        dispatchCursor,
        organizationId: campaign.organizationId,
      },
      delaySeconds,
    );
  }
}
