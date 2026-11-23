import { accountFieldsFromCredential } from '@api/collections/social-inbox/services/ingestion/inbound-message-ingestion';
import { boundLimit } from '@api/collections/social-inbox/services/social-inbox.helpers';
import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxIngestionService } from '@api/collections/social-inbox/services/social-inbox-ingestion.service';
import { FacebookInboxService } from '@api/services/integrations/facebook/services/facebook-inbox.service';
import { Platform, SocialConversationType } from '@genfeedai/contracts';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Facebook Page comments into the inbox. The Page's own posts are listed with
 * their comments, so a comment shows up whether the post was made in Genfeed or
 * on Facebook. A comment the Page wrote is an outbound reply Genfeed already
 * stored, so it is skipped.
 */
@Traced()
@Injectable()
export class SocialInboxFacebookIngestionService {
  constructor(
    private readonly ingestionService: SocialInboxIngestionService,
    private readonly facebookInboxService: FacebookInboxService,
    private readonly logger: LoggerService,
  ) {}

  async ingestFacebookComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.ingestionService.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.FACEBOOK,
      options.credentialId,
    );
    let messagesCreated = 0;
    let conversationsCreated = 0;
    let reconnectError: BadRequestException | undefined;

    for (const credential of credentials) {
      // The Graph calls run through the brand's Page token.
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      const comments = (
        await this.facebookInboxService.listPageComments(
          scope.organizationId,
          brandId,
          credential.id,
          limit,
        )
      ).filter((comment) => !comment.isFromPage);

      if (comments.length > 0) {
        const existing = await this.ingestionService.findExistingExternalIds(
          scope.organizationId,
          Platform.FACEBOOK,
          comments.map((comment) => comment.threadId),
          comments.map((comment) => comment.commentId),
        );

        for (const comment of comments) {
          const isNewConversation = !existing.conversationIds.has(
            comment.threadId,
          );
          const isNewMessage = !existing.messageIds.has(comment.commentId);

          await this.ingestionService.ingestSyncedMessage(
            {
              ...accountFieldsFromCredential(credential, scope.userId),
              body: comment.text,
              brandId,
              conversationType: SocialConversationType.COMMENT,
              createdAt: comment.createdAt,
              credentialId: credential.id,
              externalConversationId: comment.threadId,
              externalMessageId: comment.commentId,
              externalParentId: comment.commentId,
              externalThreadId: comment.threadId,
              organizationId: scope.organizationId,
              participantExternalId: comment.authorExternalId,
              participantHandle: comment.authorName,
              participantName: comment.authorName,
              platform: Platform.FACEBOOK,
              sourceContentId: comment.postId,
              sourceContentTitle: comment.postTitle,
              sourceContentType: 'post',
              sourceContentUrl: comment.postUrl,
            },
            existing.messagesByExternalId.get(comment.commentId),
            existing.conversationsByExternalId.get(comment.threadId),
          );

          if (isNewMessage) {
            messagesCreated++;
            existing.messageIds.add(comment.commentId);
          }
          if (isNewConversation) {
            conversationsCreated++;
            existing.conversationIds.add(comment.threadId);
          }
        }
      }

      reconnectError ??= await this.ensureWebhookSubscription(
        scope.organizationId,
        brandId,
        credential.id,
      );
    }

    // Comments are stored first; a grant that cannot subscribe the Page then
    // tells the user to reconnect instead of silently never receiving webhooks.
    if (reconnectError) {
      throw reconnectError;
    }

    return { conversationsCreated, messagesCreated };
  }

  /**
   * Keep the Page subscribed, so Pages connected before webhooks existed pick
   * the subscription up on their next sync. Only a missing grant is returned
   * for the user; any other failure is logged and retried on the next sync.
   */
  private async ensureWebhookSubscription(
    organizationId: string,
    brandId: string,
    credentialId: string,
  ): Promise<BadRequestException | undefined> {
    try {
      await this.facebookInboxService.ensureWebhookSubscription(
        organizationId,
        brandId,
        credentialId,
      );
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return error;
      }
      this.logger.warn('Facebook Page webhook subscription failed', {
        credentialId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return undefined;
  }
}
