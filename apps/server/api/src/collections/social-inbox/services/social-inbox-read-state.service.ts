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

const MAX_READ_RECEIPT_ATTEMPTS = 3;

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
   * A member opened the thread: clear what their view showed, and clear
   * every member's reply notifications once every thread they cover is read.
   *
   * `seenInboundSequence` is the conversation's `inboundSequence` the client
   * rendered. Omitting it reads the thread as of this request.
   */
  async markConversationRead(
    scope: SocialInboxScope,
    conversationId: string,
    seenInboundSequence?: number,
  ): Promise<SocialConversationDocument> {
    const conversation = await this.queryService.getConversation(
      scope,
      conversationId,
    );

    const updated = await this.markReadThrough(
      scope,
      conversation,
      seenInboundSequence ?? conversation.inboundSequence,
    );

    await this.clearReplyNotifications(scope, conversation.id);

    return withEffectiveAvailability(updated);
  }

  /**
   * Shared by mark-read and the resolve/archive path in
   * {@link SocialInboxActionService.updateConversation}: marks the thread
   * read through the view identified by `seenInboundSequence`.
   *
   * Every inbound message ingested after that view stays unread, so the
   * counter can only drop to `inboundSequence - seenInboundSequence`, and it
   * never rises. A stale receipt from another tab therefore cannot clear a
   * reply its view never displayed. The write is guarded by the
   * `inboundSequence` it was computed from and retried when an ingest moves
   * it in between.
   *
   * Returns the row's current state after any write, never the value
   * fetched before the attempt.
   */
  async markReadThrough(
    scope: SocialInboxScope,
    conversation: SocialConversationDocument,
    seenInboundSequence: number,
  ): Promise<SocialConversationDocument> {
    let current = conversation;
    for (let attempt = 0; attempt < MAX_READ_RECEIPT_ATTEMPTS; attempt += 1) {
      const seen = Math.min(
        Math.max(0, seenInboundSequence),
        current.inboundSequence,
      );
      const remainingUnread = Math.min(
        current.unreadCount,
        current.inboundSequence - seen,
      );
      if (remainingUnread >= current.unreadCount) {
        return current;
      }

      const cleared = await this.prisma.socialConversation.updateMany({
        data: { unreadCount: remainingUnread },
        where: scopedWhere(scope.organizationId, {
          id: current.id,
          inboundSequence: current.inboundSequence,
          unreadCount: { gt: remainingUnread },
        }),
      });
      current = await this.queryService.getConversation(scope, current.id);
      if (cleared.count > 0) {
        await this.realtimeService.emit(
          current.organizationId,
          current.id,
          'conversation-updated',
        );
        return current;
      }
    }
    return current;
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
