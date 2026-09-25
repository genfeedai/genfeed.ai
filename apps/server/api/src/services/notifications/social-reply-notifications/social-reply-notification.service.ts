import { NOTIFICATION_DELIVERY_STATUS } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  defaultInAppNotificationPreference,
  SOCIAL_REPLY_NOTIFICATION_TOPIC,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export const IN_APP_NOTIFICATION_CHANNEL = 'in_app';
export const IN_APP_NOTIFICATION_PROVIDER = 'inbox';
export const SOCIAL_REPLY_EVENT_KEY = 'social.reply.received';
export const SOCIAL_REPLY_SOURCE_TYPE = 'social_credential';

export interface SocialReplyNotificationPayload {
  version: 1;
  kind: 'social_reply';
  platform: string;
  brandId: string;
  credentialId: string;
  accountHandle: string | null;
  replyCount: number;
  newestReplyId: string;
  summary: string;
}

export interface RecordNewRepliesInput {
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: string;
  accountHandle?: string | null;
  /** External ids of replies this sync run created (not ones it re-saw). */
  newReplyExternalIds: readonly string[];
  occurredAt?: Date;
}

function compareExternalIds(left: string, right: string): number {
  // X ids are snowflakes: longer means newer, equal length compares lexically.
  return left.length === right.length
    ? left.localeCompare(right)
    : left.length - right.length;
}

export function formatSocialReplySummary(
  replyCount: number,
  accountHandle: string | null,
): string {
  const noun = replyCount === 1 ? 'reply' : 'replies';
  const handle = accountHandle ? ` on @${accountHandle.replace(/^@/, '')}` : '';
  return `${replyCount} new ${noun}${handle}`;
}

/**
 * Producer for the `social.reply` in-app topic. One event per sync run per
 * credential, keyed by the newest new reply id so a re-run of the same batch
 * upserts the same rows. The in-app delivery row is written as delivered: the
 * inbox trigger materializes it and the email worker never claims it.
 */
@Injectable()
export class SocialReplyNotificationService {
  private readonly context = {
    service: SocialReplyNotificationService.name,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async recordNewReplies(input: RecordNewRepliesInput): Promise<string | null> {
    const replyIds = [...new Set(input.newReplyExternalIds)].filter(Boolean);
    if (replyIds.length === 0) {
      return null;
    }

    const recipientUserId = await this.resolveRecipient(
      input.organizationId,
      input.credentialId,
    );
    if (!recipientUserId) {
      this.logger.warn('Social reply notification has no active recipient', {
        ...this.context,
        credentialId: input.credentialId,
        organizationId: input.organizationId,
      });
      return null;
    }

    if (!(await this.isEnabledFor(recipientUserId))) {
      return null;
    }

    const newestReplyId = replyIds.sort(compareExternalIds).at(-1) as string;
    const accountHandle = input.accountHandle?.replace(/^@/, '') || null;
    const occurredAt = input.occurredAt ?? new Date();
    const deduplicationKey = `${SOCIAL_REPLY_EVENT_KEY}/${input.organizationId}/${input.credentialId}/${newestReplyId}`;
    const payload: SocialReplyNotificationPayload = {
      accountHandle,
      brandId: input.brandId,
      credentialId: input.credentialId,
      kind: 'social_reply',
      newestReplyId,
      platform: input.platform,
      replyCount: replyIds.length,
      summary: formatSocialReplySummary(replyIds.length, accountHandle),
      version: 1,
    };

    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.notificationEvent.upsert({
        create: {
          actorUserId: null,
          deduplicationKey,
          eventKey: SOCIAL_REPLY_EVENT_KEY,
          occurredAt,
          organizationId: input.organizationId,
          payload: { ...payload },
          sourceId: input.credentialId,
          sourceType: SOCIAL_REPLY_SOURCE_TYPE,
        },
        update: {},
        where: scopedWhere(input.organizationId, { deduplicationKey }),
      });
      const delivery = await transaction.notificationDelivery.upsert({
        create: {
          channel: IN_APP_NOTIFICATION_CHANNEL,
          deliveredAt: occurredAt,
          eventId: event.id,
          idempotencyKey: `${deduplicationKey}/${recipientUserId}/${IN_APP_NOTIFICATION_CHANNEL}`,
          nextAttemptAt: occurredAt,
          organizationId: input.organizationId,
          provider: IN_APP_NOTIFICATION_PROVIDER,
          status: NOTIFICATION_DELIVERY_STATUS.DELIVERED,
          topic: SOCIAL_REPLY_NOTIFICATION_TOPIC,
          userId: recipientUserId,
        },
        update: {},
        where: scopedWhere(input.organizationId, {
          eventId_userId_channel: {
            channel: IN_APP_NOTIFICATION_CHANNEL,
            eventId: event.id,
            userId: recipientUserId,
          },
        }),
      });
      return delivery.id;
    });
  }

  /**
   * The user who connected the account, else the organization owner. Either
   * must still be an active member of the organization.
   */
  private async resolveRecipient(
    organizationId: string,
    credentialId: string,
  ): Promise<string | null> {
    const [credential, organization] = await Promise.all([
      this.prisma.credential.findFirst({
        select: { userId: true },
        where: scopedWhere(organizationId, { id: credentialId }),
      }),
      this.prisma.organization.findFirst({
        select: { userId: true },
        where: { id: organizationId, isDeleted: false },
      }),
    ]);
    const candidates = [credential?.userId, organization?.userId].filter(
      (userId): userId is string => typeof userId === 'string' && !!userId,
    );

    for (const userId of new Set(candidates)) {
      const member = await this.prisma.member.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, {
          isActive: true,
          user: { is: { isDeleted: false } },
          userId,
        }),
      });
      if (member) {
        return userId;
      }
    }
    return null;
  }

  private async isEnabledFor(userId: string): Promise<boolean> {
    // tenant-scope-ignore: preferences are account-level and keyed by the recipient resolved from an organization-scoped membership above
    const preference = await this.prisma.notificationPreference.findFirst({
      select: { isEnabled: true },
      where: {
        channel: IN_APP_NOTIFICATION_CHANNEL,
        isDeleted: false,
        topic: SOCIAL_REPLY_NOTIFICATION_TOPIC,
        userId,
      },
    });
    return (
      preference?.isEnabled ??
      defaultInAppNotificationPreference(SOCIAL_REPLY_NOTIFICATION_TOPIC)
    );
  }
}
