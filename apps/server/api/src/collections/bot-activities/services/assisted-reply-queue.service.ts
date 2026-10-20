import type { BotActivityDocument } from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildXReplyIntentUrl } from '@api/services/reply-bot/x-reply-intent.util';
import { BotActivityStatus } from '@genfeedai/contracts';
import {
  ASSISTED_X_REPLY_DAILY_CAP,
  ASSISTED_X_REPLY_MIN_GAP_MINUTES,
} from '@genfeedai/contracts/constants';
import type {
  IAssistedReplyOpenResult,
  IAssistedReplyScope,
  IAssistedReplyUsage,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * The warm-up reply queue: replies the account monitor drafted for accounts
 * that never contacted the brand. A person opens each one in X and posts it
 * there, so Genfeed never replies to those accounts through the API. The cap
 * and spacing keep a new account's reply volume human.
 */
@Injectable()
export class AssistedReplyQueueService {
  constructor(private readonly botActivitiesService: BotActivitiesService) {}

  async getUsage(scope: IAssistedReplyScope): Promise<IAssistedReplyUsage> {
    const now = Date.now();
    const [awaiting, postedToday, latestPostedAt] = await Promise.all([
      this.botActivitiesService.countAwaitingApproval(
        scope.organizationId,
        scope.brandId,
      ),
      this.botActivitiesService.countManuallyPostedSince(
        scope.organizationId,
        scope.brandId,
        new Date(now - DAY_MS),
      ),
      this.botActivitiesService.findLatestManuallyPostedAt(
        scope.organizationId,
        scope.brandId,
      ),
    ]);
    const gapEndsAt = latestPostedAt
      ? latestPostedAt.getTime() + ASSISTED_X_REPLY_MIN_GAP_MINUTES * MINUTE_MS
      : 0;

    return {
      awaiting,
      dailyCap: ASSISTED_X_REPLY_DAILY_CAP,
      minGapMinutes: ASSISTED_X_REPLY_MIN_GAP_MINUTES,
      nextAllowedAt: gapEndsAt > now ? new Date(gapEndsAt).toISOString() : null,
      postedToday,
      remainingToday: Math.max(0, ASSISTED_X_REPLY_DAILY_CAP - postedToday),
    };
  }

  /** Saves the edited draft and returns the X composer link for it. */
  async open(
    scope: IAssistedReplyScope,
    id: string,
    replyText?: string,
  ): Promise<IAssistedReplyOpenResult> {
    const activity = await this.loadAwaiting(scope, id);
    await this.assertWithinLimits(activity);

    const text = (replyText ?? this.draftOf(activity)).trim();
    if (!text) {
      throw new BusinessLogicException(
        'Write the reply before opening it in X.',
        { activityId: id },
        'ASSISTED_REPLY_EMPTY',
      );
    }
    if (text !== this.draftOf(activity)) {
      await this.botActivitiesService.updateDraft(
        id,
        scope.organizationId,
        text,
      );
    }

    const targetId = String(activity.triggerTweetId ?? '');
    const intentUrl = buildXReplyIntentUrl(targetId, text);
    if (!intentUrl) {
      throw new BusinessLogicException(
        'This reply has no X post to answer.',
        { activityId: id },
        'ASSISTED_REPLY_NO_TARGET',
      );
    }

    return {
      intentUrl,
      targetUrl: `https://x.com/${String(activity.triggerTweetAuthorUsername ?? 'i')}/status/${targetId}`,
    };
  }

  /** The person posted it in X: it now counts toward the daily cap. */
  async markPosted(
    scope: IAssistedReplyScope,
    id: string,
  ): Promise<IAssistedReplyUsage> {
    const activity = await this.loadAwaiting(scope, id);
    await this.assertWithinLimits(activity);
    await this.botActivitiesService.markManuallyPosted(
      id,
      scope.organizationId,
      this.draftOf(activity),
    );
    return this.getUsage({
      brandId: activity.brandId,
      organizationId: scope.organizationId,
    });
  }

  async dismiss(
    scope: IAssistedReplyScope,
    id: string,
  ): Promise<IAssistedReplyUsage> {
    const activity = await this.loadAwaiting(scope, id);
    await this.botActivitiesService.markDismissed(id, scope.organizationId);
    return this.getUsage({
      brandId: activity.brandId,
      organizationId: scope.organizationId,
    });
  }

  private draftOf(activity: BotActivityDocument): string {
    return typeof activity.draftReplyText === 'string'
      ? activity.draftReplyText
      : '';
  }

  private async loadAwaiting(
    scope: IAssistedReplyScope,
    id: string,
  ): Promise<BotActivityDocument> {
    const activity = (await this.botActivitiesService.findOne({
      id,
      organizationId: scope.organizationId,
    })) as BotActivityDocument | null;

    if (
      !activity ||
      (scope.brandId && activity.brandId && activity.brandId !== scope.brandId)
    ) {
      throw new NotFoundException('Bot activity', id);
    }
    if (activity.status !== BotActivityStatus.AWAITING_APPROVAL) {
      throw new BusinessLogicException(
        'This reply is no longer waiting for approval.',
        { activityId: id, status: activity.status },
        'ASSISTED_REPLY_NOT_AWAITING',
      );
    }
    return activity;
  }

  private async assertWithinLimits(activity: BotActivityDocument) {
    const usage = await this.getUsage({
      brandId: activity.brandId,
      organizationId: activity.organizationId,
    });
    if (usage.remainingToday <= 0) {
      throw new BusinessLogicException(
        `Daily limit reached: ${usage.dailyCap} replies in 24 hours keeps a new X account safe. Try again later.`,
        { dailyCap: usage.dailyCap, postedToday: usage.postedToday },
        'ASSISTED_REPLY_DAILY_CAP',
      );
    }
    if (usage.nextAllowedAt) {
      throw new BusinessLogicException(
        `Wait until ${usage.nextAllowedAt} before the next reply so the account does not post in bursts.`,
        { nextAllowedAt: usage.nextAllowedAt },
        'ASSISTED_REPLY_TOO_SOON',
      );
    }
  }
}
