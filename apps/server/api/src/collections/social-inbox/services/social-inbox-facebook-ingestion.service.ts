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

interface FacebookIngestResult {
  conversationsCreated: number;
  messagesCreated: number;
}

interface FacebookIngestOptions {
  credentialId?: string;
  limit?: number;
}

/**
 * A Facebook Page's Messages inbox: comments on its posts and Messenger
 * conversations. The Page's own posts are listed with their comments, so a
 * comment shows up whether the post was made in Genfeed or on Facebook. A
 * comment or message the Page wrote is an outbound reply Genfeed already
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

  /**
   * Comments and Messenger conversations in one pass, so a manual Sync and a
   * webhook of either kind refresh the whole Page. Each part stores what it can
   * before a missing grant is reported: a Page connected before Messenger was
   * requested still gets its comments, then is asked to reconnect.
   */
  async ingestFacebookInbox(
    scope: SocialInboxScope,
    options: FacebookIngestOptions = {},
  ): Promise<FacebookIngestResult> {
    const totals = { conversationsCreated: 0, messagesCreated: 0 };
    let reconnectError: BadRequestException | undefined;

    for (const ingest of [
      this.ingestFacebookComments,
      this.ingestFacebookMessages,
    ]) {
      try {
        const result = await ingest.call(this, scope, options);
        totals.conversationsCreated += result.conversationsCreated;
        totals.messagesCreated += result.messagesCreated;
      } catch (error: unknown) {
        if (!(error instanceof BadRequestException)) {
          throw error;
        }
        reconnectError ??= error;
      }
    }

    if (reconnectError) {
      throw reconnectError;
    }

    return totals;
  }

  /** Messenger conversations of the Page: the person's messages, oldest first. */
  async ingestFacebookMessages(
    scope: SocialInboxScope,
    options: FacebookIngestOptions = {},
  ): Promise<FacebookIngestResult> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.ingestionService.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.FACEBOOK,
      options.credentialId,
    );
    let messagesCreated = 0;
    let conversationsCreated = 0;

    for (const credential of credentials) {
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      const threads = await this.facebookInboxService.listMessengerThreads(
        scope.organizationId,
        brandId,
        credential.id,
        limit,
      );
      if (threads.length === 0) {
        continue;
      }

      const existing = await this.ingestionService.findExistingExternalIds(
        scope.organizationId,
        Platform.FACEBOOK,
        threads.map((thread) => thread.conversationId),
        threads.flatMap((thread) =>
          thread.messages.map((message) => message.messageId),
        ),
      );

      for (const thread of threads) {
        // Graph returns the newest messages first; ingest oldest first so the
        // conversation preview lands on the newest one.
        const ordered = [...thread.messages].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        for (const message of ordered) {
          const isNewConversation = !existing.conversationIds.has(
            thread.conversationId,
          );
          const isNewMessage = !existing.messageIds.has(message.messageId);

          await this.ingestionService.ingestSyncedMessage(
            {
              ...accountFieldsFromCredential(credential, scope.userId),
              body: message.text,
              brandId,
              conversationType: SocialConversationType.DM,
              createdAt: message.createdAt,
              credentialId: credential.id,
              externalConversationId: thread.conversationId,
              externalMessageId: message.messageId,
              externalThreadId: thread.conversationId,
              organizationId: scope.organizationId,
              participantExternalId:
                message.senderExternalId ?? thread.participantExternalId,
              participantName: message.senderName ?? thread.participantName,
              platform: Platform.FACEBOOK,
            },
            existing.messagesByExternalId.get(message.messageId),
            existing.conversationsByExternalId.get(thread.conversationId),
          );

          if (isNewMessage) {
            messagesCreated++;
            existing.messageIds.add(message.messageId);
          }
          if (isNewConversation) {
            conversationsCreated++;
            existing.conversationIds.add(thread.conversationId);
          }
        }
      }
    }

    return { conversationsCreated, messagesCreated };
  }

  async ingestFacebookComments(
    scope: SocialInboxScope,
    options: FacebookIngestOptions = {},
  ): Promise<FacebookIngestResult> {
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
