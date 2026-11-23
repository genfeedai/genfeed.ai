import type { SocialConversationDocument } from '@api/collections/social-inbox/schemas/social-inbox.schema';
import {
  FACEBOOK_DM_WINDOW_REASON,
  isWithinFacebookReplyWindow,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import { FacebookInboxService } from '@api/services/integrations/facebook/services/facebook-inbox.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { Platform } from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Sends a direct message through the provider that owns the conversation. The
 * outbound workflow decides whether to send and records the result; this is
 * only the provider call, so each provider's rules live in one place.
 */
@Traced()
@Injectable()
export class SocialInboxDmSenderService {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly facebookInboxService: FacebookInboxService,
  ) {}

  async send(
    conversation: SocialConversationDocument,
    body: string,
    recipientId: unknown,
  ): Promise<{ messageId: string }> {
    if (!conversation.brandId) {
      throw new BadRequestException('A brand is required to send DMs');
    }

    if (
      conversation.platform !== Platform.INSTAGRAM &&
      conversation.platform !== Platform.FACEBOOK
    ) {
      throw new BadRequestException(
        `${conversation.platform} DMs are not supported`,
      );
    }

    const recipient =
      (typeof recipientId === 'string' ? recipientId : undefined) ??
      conversation.participantExternalId;
    if (!recipient) {
      throw new BadRequestException(
        `${conversation.platform === Platform.FACEBOOK ? 'Messenger' : 'Instagram'} DM requires a recipient id`,
      );
    }

    if (conversation.platform === Platform.FACEBOOK) {
      return this.sendMessengerMessage(
        conversation,
        conversation.brandId,
        recipient,
        body,
      );
    }

    const messageId = await this.instagramService.sendDirectMessage(
      conversation.organizationId,
      conversation.brandId,
      recipient,
      body,
      conversation.credentialId ?? undefined,
    );
    if (!messageId) throw new Error('Instagram did not return a message_id.');
    return { messageId };
  }

  private async sendMessengerMessage(
    conversation: SocialConversationDocument,
    brandId: string,
    recipientId: string,
    body: string,
  ): Promise<{ messageId: string }> {
    // The workflow checked this when the reply was queued; a retry can run
    // later, after the window closed.
    if (!isWithinFacebookReplyWindow(conversation.lastInboundAt)) {
      throw new BadRequestException(FACEBOOK_DM_WINDOW_REASON);
    }
    if (!conversation.credentialId) {
      throw new BadRequestException(
        'This Messenger conversation has no connected Page. Reconnect Facebook.',
      );
    }

    const messageId = await this.facebookInboxService.sendMessengerMessage(
      conversation.organizationId,
      brandId,
      conversation.credentialId,
      recipientId,
      body,
    );
    return { messageId };
  }
}
