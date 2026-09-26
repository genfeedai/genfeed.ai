import type { SocialConversationDocument } from '@api/collections/social-inbox/schemas/social-inbox.schema';
import { withEffectiveAvailability } from '@api/collections/social-inbox/services/social-inbox.helpers';
import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { SocialReplyNotificationService } from '@api/services/notifications/social-reply-notifications/social-reply-notification.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/**
 * Read receipts for the social inbox. Keeps a conversation's unread counter
 * and the organization's `social.reply` bell items in step.
 */
@Injectable()
export class SocialInboxReadStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: SocialInboxQueryService,
    private readonly realtimeService: SocialInboxRealtimeService,
    private readonly socialReplyNotifications: SocialReplyNotificationService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * A member opened the thread: clear the unread counter down by exactly
   * what the client saw, and clear every member's reply notifications once
   * every thread they cover is read.
   *
   * `unreadCountSeen` is the unread count the client actually rendered
   * before it issued this request — not re-derived here from a fresh read,
   * which would still be racing the client's view by the network round
   * trip. Falls back to a just-read snapshot for callers that omit it
   * (e.g. older clients), which narrows but does not close that race.
   *
   * The clear is a conditional, atomic decrement guarded by that seen
   * count — never a hard reset to zero. A reply landing after the client's
   * view (but before or during this request) must stay counted, or the
   * badge would hide a message nobody has actually seen yet. When the guard
   * doesn't match (someone else's write already moved the counter), this
   * still re-reads and returns the current row instead of the value fetched
   * before the attempt.
   */
  async markConversationRead(
    scope: SocialInboxScope,
    conversationId: string,
    unreadCountSeen?: number,
  ): Promise<SocialConversationDocument> {
    const conversation = await this.queryService.getConversation(
      scope,
      conversationId,
    );

    const seenUnreadCount =
      typeof unreadCountSeen === 'number'
        ? Math.max(0, Math.min(unreadCountSeen, conversation.unreadCount))
        : conversation.unreadCount;

    const updated = await this.clearSeenUnreadCount(
      scope,
      conversation,
      seenUnreadCount,
    );

    await this.clearReplyNotifications(scope, conversation.id);

    return withEffectiveAvailability(updated);
  }

  /**
   * Shared by mark-read and the resolve/archive path in
   * {@link SocialInboxActionService.updateConversation}: atomically
   * decrements a conversation's unread counter by exactly `seenUnreadCount`,
   * guarded by the counter still being at least that value — never a hard
   * reset. A reply landing in the gap between the caller's read and this
   * write must stay counted, or the badge would hide a message nobody has
   * actually seen yet.
   *
   * Always re-reads and returns the row's current state when
   * `seenUnreadCount` is positive, whether or not the guard matched: a
   * concurrent write may have already changed the row, and the caller must
   * never see the value fetched before this attempt.
   */
  async clearSeenUnreadCount(
    scope: SocialInboxScope,
    conversation: SocialConversationDocument,
    seenUnreadCount: number,
  ): Promise<SocialConversationDocument> {
    if (seenUnreadCount <= 0) {
      return conversation;
    }

    const cleared = await this.prisma.socialConversation.updateMany({
      data: { unreadCount: { decrement: seenUnreadCount } },
      where: scopedWhere(scope.organizationId, {
        id: conversation.id,
        unreadCount: { gte: seenUnreadCount },
      }),
    });
    const updated = await this.queryService.getConversation(
      scope,
      conversation.id,
    );
    if (cleared.count > 0) {
      await this.realtimeService.emit(
        updated.organizationId,
        updated.id,
        'conversation-updated',
      );
    }
    return updated;
  }

  /**
   * Clear every member's reply notifications for a thread whose unread
   * counter was zeroed (read, replied to or resolved). Items covering other
   * still-unread threads stay unread.
   *
   * Never throws: every caller (postReply, sendDm, approveDraft, resolve,
   * archive, mark-read) has already committed the action this clears the
   * bell for. A broken query shape or any other failure here must not turn
   * an already-posted reply into a 500 — it would tell the caller to retry
   * an action that already happened. Failures are logged and reported to
   * Sentry so a real regression (like an invalid query shape) is still
   * visible; the query-shape spec on
   * `SocialReplyNotificationService.findUnreadInboxItemsCoveringConversation`
   * remains the CI guard against introducing one.
   */
  async clearReplyNotifications(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.socialReplyNotifications.markConversationRepliesRead({
        conversationId,
        organizationId: scope.organizationId,
      });
    } catch (error: unknown) {
      this.logger.error('Failed to clear social reply notifications', error, {
        conversationId,
        organizationId: scope.organizationId,
      });
      Sentry.captureException(error, {
        extra: {
          conversationId,
          organizationId: scope.organizationId,
        },
      });
    }
  }
}
