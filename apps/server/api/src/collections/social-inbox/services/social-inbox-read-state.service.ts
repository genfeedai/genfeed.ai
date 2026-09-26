import type { SocialConversationDocument } from '@api/collections/social-inbox/schemas/social-inbox.schema';
import { withEffectiveAvailability } from '@api/collections/social-inbox/services/social-inbox.helpers';
import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { SocialReplyNotificationService } from '@api/services/notifications/social-reply-notifications/social-reply-notification.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Injectable } from '@nestjs/common';

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
  ) {}

  /**
   * A member opened the thread: zero its unread counter and clear every
   * member's reply notifications once every thread they cover is read.
   */
  async markConversationRead(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<SocialConversationDocument> {
    const conversation = await this.queryService.getConversation(
      scope,
      conversationId,
    );

    let updated = conversation;
    if (conversation.unreadCount > 0) {
      updated = await this.prisma.socialConversation.update({
        data: { unreadCount: 0 },
        where: scopedWhere(scope.organizationId, { id: conversation.id }),
      });
      await this.realtimeService.emit(
        updated.organizationId,
        updated.id,
        'conversation-updated',
      );
    }

    await this.clearReplyNotifications(scope, conversation.id);

    return withEffectiveAvailability(updated);
  }

  /**
   * Clear every member's reply notifications for a thread whose unread
   * counter was zeroed (read, replied to or resolved). Items covering other
   * still-unread threads stay unread.
   */
  async clearReplyNotifications(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<void> {
    await this.socialReplyNotifications.markConversationRepliesRead({
      conversationId,
      organizationId: scope.organizationId,
    });
  }
}
