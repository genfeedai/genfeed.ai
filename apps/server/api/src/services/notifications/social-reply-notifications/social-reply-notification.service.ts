import type { CreatedSocialMessageRef } from '@api/collections/social-inbox/services/social-inbox.types';
import { NOTIFICATION_DELIVERY_STATUS } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  defaultInAppNotificationPreference,
  SOCIAL_REPLY_NOTIFICATION_TOPIC,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export const IN_APP_NOTIFICATION_CHANNEL = 'in_app';
export const IN_APP_NOTIFICATION_PROVIDER = 'inbox';
export const SOCIAL_REPLY_EVENT_KEY = 'social.reply.received';
export const SOCIAL_REPLY_SOURCE_TYPE = 'social_credential';

/**
 * Carries the social inbox conversations the replies landed in, so the bell
 * deep-links to a thread and clears once every thread it covers is read.
 */
export interface SocialReplyNotificationPayload {
  version: 2;
  kind: 'social_reply';
  platform: string;
  brandId: string;
  credentialId: string;
  accountHandle: string | null;
  replyCount: number;
  newestReplyId: string;
  /** Conversation holding the newest reply: the bell item's link target. */
  newestConversationId: string;
  /** Every conversation this run added replies to, newest first. */
  conversationIds: string[];
  summary: string;
}

export interface RecordNewRepliesInput {
  organizationId: string;
  brandId: string;
  credentialId: string;
  platform: string;
  accountHandle?: string | null;
  /** Replies this sync run created (not ones it re-saw). */
  newReplies: readonly CreatedSocialMessageRef[];
  occurredAt?: Date;
}

export interface MarkConversationRepliesReadInput {
  organizationId: string;
  conversationId: string;
}

function readConversationIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  const ids = (payload as Record<string, unknown>).conversationIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string' && !!id)
    : [];
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
    const repliesById = new Map<string, CreatedSocialMessageRef>();
    for (const reply of input.newReplies) {
      if (reply.externalMessageId && reply.conversationId) {
        repliesById.set(reply.externalMessageId, reply);
      }
    }
    // Newest first, so the first conversation is the newest reply's thread.
    const replies = [...repliesById.values()].sort((left, right) =>
      compareExternalIds(right.externalMessageId, left.externalMessageId),
    );
    const newestReply = replies[0];
    if (!newestReply) {
      return null;
    }

    const conversationIds = [
      ...new Set(replies.map((reply) => reply.conversationId)),
    ];
    // Notify only runs after ingest already incremented these threads'
    // unread counters, but a member can read one before this call fires —
    // directly, or via the pending-cache retry path a failed notify leaves
    // behind. A bell item created here would cover only already-read
    // threads and nothing would ever mark it read (markConversationRepliesRead
    // only fires on a future read/reply/resolve). Skip creating it instead.
    if (
      await this.everyConversationIsRead(input.organizationId, conversationIds)
    ) {
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

    const newestReplyId = newestReply.externalMessageId;
    const accountHandle = input.accountHandle?.replace(/^@/, '') || null;
    const occurredAt = input.occurredAt ?? new Date();
    const deduplicationKey = `${SOCIAL_REPLY_EVENT_KEY}/${input.organizationId}/${input.credentialId}/${newestReplyId}`;
    const payload: SocialReplyNotificationPayload = {
      accountHandle,
      brandId: input.brandId,
      conversationIds,
      credentialId: input.credentialId,
      kind: 'social_reply',
      newestConversationId: newestReply.conversationId,
      newestReplyId,
      platform: input.platform,
      replyCount: replies.length,
      summary: formatSocialReplySummary(replies.length, accountHandle),
      version: 2,
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
   * A thread was read, replied to or resolved: clear every member's unread
   * `social.reply` items in the organization that reference it, but only once
   * every conversation such an item covers has no unread messages (one run
   * can add replies to several threads). The thread's read state is shared by
   * the team, so the bell follows it for everyone. Returns how many items
   * were marked read. Failures are logged, never thrown, so the underlying
   * action always succeeds.
   */
  async markConversationRepliesRead(
    input: MarkConversationRepliesReadInput,
  ): Promise<number> {
    const { conversationId, organizationId } = input;
    if (!organizationId || !conversationId) {
      return 0;
    }

    try {
      const items = await this.findUnreadInboxItemsCoveringConversation(
        organizationId,
        conversationId,
      );
      const coverage = items.map((item) => ({
        conversationIds: readConversationIds(item.event.payload),
        id: item.id,
      }));
      const referencedIds = [
        ...new Set(coverage.flatMap((item) => item.conversationIds)),
      ];
      if (referencedIds.length === 0) {
        return 0;
      }

      const stillUnread = await this.prisma.socialConversation.findMany({
        select: { id: true },
        where: scopedWhere(organizationId, {
          id: { in: referencedIds },
          unreadCount: { gt: 0 },
        }),
      });
      const unreadIds = new Set(stillUnread.map((row) => row.id));
      const readItemIds = coverage
        .filter(
          (item) =>
            item.conversationIds.includes(conversationId) &&
            item.conversationIds.every((id) => !unreadIds.has(id)),
        )
        .map((item) => item.id);
      if (readItemIds.length === 0) {
        return 0;
      }

      const result = await this.prisma.notificationInboxItem.updateMany({
        data: { readAt: new Date() },
        where: scopedWhere(organizationId, {
          id: { in: readItemIds },
          readAt: null,
          topic: SOCIAL_REPLY_NOTIFICATION_TOPIC,
        }),
      });
      return result.count;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientValidationError) {
        // An invalid query shape is a code bug, not the transient failure
        // this catch exists for — swallowing it here would hide every read
        // silently no-op-ing forever, indistinguishable from "already read".
        throw error;
      }
      this.logger.error('Social reply notification read sync failed', error, {
        ...this.context,
        conversationId,
        organizationId,
      });
      return 0;
    }
  }

  /**
   * Every unread `social.reply` inbox item whose event payload covers the
   * given conversation. Split out from {@link markConversationRepliesRead}
   * so its `array_contains`/`path` JSON filter — the one part of that method
   * a mocked Prisma delegate can never validate — has a query a Postgres-
   * shape spec can call directly against the real Prisma client.
   */
  private findUnreadInboxItemsCoveringConversation(
    organizationId: string,
    conversationId: string,
  ) {
    return this.prisma.notificationInboxItem.findMany({
      select: { event: { select: { payload: true } }, id: true },
      where: scopedWhere(organizationId, {
        event: {
          isDeleted: false,
          organizationId,
          payload: {
            array_contains: [conversationId],
            path: ['conversationIds'],
          },
        },
        readAt: null,
        topic: SOCIAL_REPLY_NOTIFICATION_TOPIC,
      }),
    });
  }

  /**
   * True when none of the given conversations has an unread message, so a
   * notification covering only them would never clear.
   */
  private async everyConversationIsRead(
    organizationId: string,
    conversationIds: readonly string[],
  ): Promise<boolean> {
    if (conversationIds.length === 0) {
      return true;
    }
    const stillUnread = await this.prisma.socialConversation.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        id: { in: [...conversationIds] },
        unreadCount: { gt: 0 },
      }),
    });
    return !stillUnread;
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
