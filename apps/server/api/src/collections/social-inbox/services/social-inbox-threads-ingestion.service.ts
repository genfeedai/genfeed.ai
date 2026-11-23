import { accountFieldsFromCredential } from '@api/collections/social-inbox/services/ingestion/inbound-message-ingestion';
import { boundLimit } from '@api/collections/social-inbox/services/social-inbox.helpers';
import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxIngestionService } from '@api/collections/social-inbox/services/social-inbox-ingestion.service';
import { ThreadsReplyService } from '@api/services/integrations/threads/services/threads-reply.service';
import { Platform, SocialConversationType } from '@genfeedai/contracts';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

interface ThreadsIngestResult {
  conversationsCreated: number;
  messagesCreated: number;
}

interface ThreadsIngestOptions {
  credentialId?: string;
  limit?: number;
}

/**
 * Replies on a connected Threads account's posts. The account's own posts are
 * listed with their replies, so a reply shows up whether the post was made in
 * Genfeed or on Threads. A reply the account wrote is an outbound message
 * Genfeed already stored, so it is skipped.
 */
@Traced()
@Injectable()
export class SocialInboxThreadsIngestionService {
  constructor(
    private readonly ingestionService: SocialInboxIngestionService,
    private readonly threadsReplyService: ThreadsReplyService,
  ) {}

  async ingestThreadsReplies(
    scope: SocialInboxScope,
    options: ThreadsIngestOptions = {},
  ): Promise<ThreadsIngestResult> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.ingestionService.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.THREADS,
      options.credentialId,
    );
    let messagesCreated = 0;
    let conversationsCreated = 0;

    for (const credential of credentials) {
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      const replies = (
        await this.threadsReplyService.listReplies(
          scope.organizationId,
          brandId,
          credential.id,
          limit,
        )
      ).filter((reply) => !reply.isOwn);
      if (replies.length === 0) {
        continue;
      }

      const existing = await this.ingestionService.findExistingExternalIds(
        scope.organizationId,
        Platform.THREADS,
        replies.map((reply) => reply.threadId),
        replies.map((reply) => reply.replyId),
      );

      // Oldest first, so the conversation preview lands on the newest reply.
      const ordered = [...replies].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );

      for (const reply of ordered) {
        const isNewConversation = !existing.conversationIds.has(reply.threadId);
        const isNewMessage = !existing.messageIds.has(reply.replyId);

        await this.ingestionService.ingestSyncedMessage(
          {
            ...accountFieldsFromCredential(credential, scope.userId),
            body: reply.text,
            brandId,
            conversationType: SocialConversationType.COMMENT,
            createdAt: reply.createdAt,
            credentialId: credential.id,
            externalConversationId: reply.threadId,
            externalMessageId: reply.replyId,
            // A reply is answered by replying to that exact reply.
            externalParentId: reply.replyId,
            externalThreadId: reply.threadId,
            organizationId: scope.organizationId,
            participantHandle: reply.authorHandle,
            participantName: reply.authorHandle,
            platform: Platform.THREADS,
            sourceContentId: reply.postId,
            sourceContentTitle: reply.postTitle,
            sourceContentType: 'post',
            sourceContentUrl: reply.postUrl,
          },
          existing.messagesByExternalId.get(reply.replyId),
          existing.conversationsByExternalId.get(reply.threadId),
        );

        if (isNewMessage) {
          messagesCreated++;
          existing.messageIds.add(reply.replyId);
        }
        if (isNewConversation) {
          conversationsCreated++;
          existing.conversationIds.add(reply.threadId);
        }
      }
    }

    return { conversationsCreated, messagesCreated };
  }
}
