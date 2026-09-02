import type {
  SocialConversationAvailability,
  SocialConversationDocument,
  SocialMessage,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import {
  asRecord,
  boundLimit,
  clamp,
  getAvailability,
  LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
  normalizePlatform,
  sanitizeBody,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  InboundSocialMessageInput,
  SocialInboxScope,
} from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxProviderError } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { scopedWhere } from '@api/index';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostStatus,
  SocialConversationType,
  SocialMessageType,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const WORKFLOW_TRIGGER_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const X_DM_MAX_PAGES = 5;

type ConnectedCredentialAccount = {
  externalHandle?: string | null;
  externalId?: string | null;
  externalName?: string | null;
  label?: string | null;
  userId?: string | null;
  username?: string | null;
};

function accountFieldsFromCredential(
  credential: ConnectedCredentialAccount,
  fallbackUserId?: string,
) {
  return {
    accountExternalId: credential.externalId ?? undefined,
    accountHandle:
      credential.externalHandle ?? credential.username ?? undefined,
    accountName: credential.externalName ?? credential.label ?? undefined,
    userId: credential.userId ?? fallbackUserId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProviderRateLimit(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const status = error.status ?? error.code ?? error.statusCode;
  if (status === 429 || status === '429') {
    return true;
  }

  const message =
    typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    isRecord(error.rateLimit)
  );
}

type WorkflowTriggerClaim = {
  attemptedAt: Date;
  jobId: string;
};

@Injectable()
export class SocialInboxIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService,
    private readonly instagramService: InstagramService,
    private readonly twitterService: TwitterService,
    private readonly linkedInService: LinkedInService,
    private readonly realtimeService: SocialInboxRealtimeService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    private readonly logger?: LoggerService,
  ) {}

  private get workflowExecutionQueueService():
    | WorkflowExecutionQueueService
    | undefined {
    try {
      return this.moduleRef.get(WorkflowExecutionQueueService, {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }

  async ingestInboundMessage(
    input: InboundSocialMessageInput,
  ): Promise<SocialMessageDocument> {
    const platform = normalizePlatform(input.platform);
    const body = sanitizeBody(input.body);
    const messageCreatedAt = input.createdAt ?? new Date();
    const availability = getAvailability({
      conversationType: input.conversationType,
      externalParentId: input.externalParentId,
      participantExternalId: input.participantExternalId,
      platform,
      sourceContentId: input.sourceContentId,
    });

    const conversation = await this.findOrCreateConversation({
      ...input,
      availability,
      body,
      createdAt: messageCreatedAt,
      platform,
    });

    const existing = await this.prisma.socialMessage.findFirst({
      where: scopedWhere(input.organizationId, {
        externalMessageId: input.externalMessageId,
        platform,
      }),
    });

    if (existing) {
      await this.queueCommentTrigger(input, existing, conversation);
      return existing;
    }

    let message: Awaited<ReturnType<typeof this.prisma.socialMessage.create>>;
    try {
      message = await this.prisma.socialMessage.create({
        data: {
          body,
          brandId: input.brandId,
          conversationId: conversation.id,
          createdAt: messageCreatedAt,
          credentialId: input.credentialId,
          direction: 'inbound',
          externalMessageId: input.externalMessageId,
          externalParentMessageId: input.externalParentMessageId,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          messageType:
            input.conversationType === SocialConversationType.DM
              ? SocialMessageType.DM
              : SocialMessageType.COMMENT,
          organizationId: input.organizationId,
          platform,
          postId: input.postId,
          senderAvatarUrl: clamp(input.participantAvatarUrl, 2048),
          senderExternalId: clamp(input.participantExternalId, 512),
          senderHandle: clamp(input.participantHandle, 280),
          senderName: clamp(input.participantName, 280),
          sourceUrl: clamp(input.sourceContentUrl, 2048),
          status: 'received',
          userId: input.userId,
          workflowTriggerStatus:
            this.workflowExecutionQueueService && input.userId
              ? 'pending'
              : undefined,
        },
      });
    } catch (error) {
      // Same ingestion race as conversations: unique
      // (organizationId, platform, externalMessageId) makes the losing
      // concurrent create throw P2002 — return the winner's row.
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error;
      }
      const winner = await this.prisma.socialMessage.findFirst({
        where: scopedWhere(input.organizationId, {
          externalMessageId: input.externalMessageId,
          platform,
        }),
      });
      if (!winner) {
        throw error;
      }
      await this.queueCommentTrigger(input, winner, conversation);
      return winner;
    }

    // Platform APIs return batches reverse-chronological, so an older message
    // can be ingested after a newer one. Only advance the preview fields when
    // this message is the newest seen; the unread counter always increments.
    const previewAdvanced = await this.prisma.socialConversation.updateMany({
      data: {
        latestMessageAt: messageCreatedAt,
        latestMessageText: clamp(body, 500),
        lastInboundAt: messageCreatedAt,
        unreadCount: { increment: 1 },
        updatedAt: new Date(),
      },
      where: scopedWhere(input.organizationId, {
        id: conversation.id,
        OR: [
          { latestMessageAt: null },
          { latestMessageAt: { lte: messageCreatedAt } },
        ],
      }),
    });

    if (previewAdvanced.count === 0) {
      await this.prisma.socialConversation.updateMany({
        data: {
          unreadCount: { increment: 1 },
          updatedAt: new Date(),
        },
        where: scopedWhere(input.organizationId, {
          id: conversation.id,
        }),
      });
    }

    await this.queueCommentTrigger(input, message, conversation);

    await this.realtimeService.emit(
      input.organizationId,
      conversation.id,
      'message-created',
    );

    return message;
  }

  async ingestYoutubeComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.YOUTUBE,
      options.credentialId,
    );
    let messagesCreated = 0;
    let conversationsCreated = 0;

    for (const credential of credentials) {
      const posts = await this.prisma.post.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 20,
        where: scopedWhere(scope.organizationId, {
          brandId: credential.brandId ?? undefined,
          credentialId: credential.id,
          externalId: { not: null },
          platform: Platform.YOUTUBE,
          status: { in: [PostStatus.PUBLIC] },
        }),
      });

      for (const post of posts) {
        const comments = await this.youtubeService.listVideoComments(
          scope.organizationId,
          post.brandId,
          String(post.externalId),
          limit,
          credential.id,
        );

        if (comments.length === 0) {
          continue;
        }

        // Resolve which external ids already exist in one findMany pair for the
        // whole post instead of a findFirst pair per comment. The sets are
        // seeded from the DB snapshot and grown as we ingest so duplicates
        // sharing a thread within the same batch are only counted once.
        const existing = await this.findExistingExternalIds(
          scope.organizationId,
          Platform.YOUTUBE,
          comments.map((comment) => comment.threadId),
          comments.map((comment) => comment.commentId),
        );

        for (const comment of comments) {
          const isNewConversation = !existing.conversationIds.has(
            comment.threadId,
          );
          const isNewMessage = !existing.messageIds.has(comment.commentId);

          await this.ingestSyncedMessage(
            {
              ...accountFieldsFromCredential(credential, scope.userId),
              body: comment.text,
              brandId: post.brandId,
              conversationType: SocialConversationType.COMMENT,
              credentialId: credential.id,
              createdAt: comment.createdAt,
              externalConversationId: comment.threadId,
              externalMessageId: comment.commentId,
              externalParentId: comment.commentId,
              externalThreadId: comment.threadId,
              organizationId: scope.organizationId,
              participantAvatarUrl: comment.authorAvatarUrl,
              participantExternalId: comment.authorChannelId,
              participantHandle: comment.authorChannelUrl,
              participantName: comment.authorDisplayName,
              platform: Platform.YOUTUBE,
              postId: post.id,
              sourceContentId: String(post.externalId),
              sourceContentTitle: post.label ?? post.description.slice(0, 120),
              sourceContentType: 'video',
              sourceContentUrl:
                post.url ??
                `https://www.youtube.com/watch?v=${post.externalId}`,
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
    }

    return { conversationsCreated, messagesCreated };
  }

  async ingestInstagramComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.INSTAGRAM,
      options.credentialId,
    );
    let messagesCreated = 0;
    let conversationsCreated = 0;

    for (const credential of credentials) {
      const posts = await this.prisma.post.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 20,
        where: scopedWhere(scope.organizationId, {
          brandId: credential.brandId ?? undefined,
          credentialId: credential.id,
          externalId: { not: null },
          platform: Platform.INSTAGRAM,
          status: { in: [PostStatus.PUBLIC] },
        }),
      });

      for (const post of posts) {
        const comments = await this.instagramService.listMediaComments(
          scope.organizationId,
          post.brandId,
          String(post.externalId),
          limit,
          credential.id,
        );

        if (comments.length === 0) {
          continue;
        }

        const existing = await this.findExistingExternalIds(
          scope.organizationId,
          Platform.INSTAGRAM,
          comments.map((comment) => comment.threadId),
          comments.map((comment) => comment.commentId),
        );

        for (const comment of comments) {
          const isNewConversation = !existing.conversationIds.has(
            comment.threadId,
          );
          const isNewMessage = !existing.messageIds.has(comment.commentId);

          await this.ingestSyncedMessage(
            {
              ...accountFieldsFromCredential(credential, scope.userId),
              body: comment.text,
              brandId: post.brandId,
              conversationType: SocialConversationType.COMMENT,
              createdAt: comment.createdAt,
              credentialId: credential.id,
              externalConversationId: comment.threadId,
              externalMessageId: comment.commentId,
              externalParentId: comment.commentId,
              externalThreadId: comment.threadId,
              organizationId: scope.organizationId,
              participantExternalId: comment.authorExternalId,
              participantHandle: comment.authorUsername,
              participantName: comment.authorUsername,
              platform: Platform.INSTAGRAM,
              postId: post.id,
              sourceContentId: String(post.externalId),
              sourceContentTitle: post.label ?? post.description.slice(0, 120),
              sourceContentType: 'media',
              sourceContentUrl: post.url ?? undefined,
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
    }

    return { conversationsCreated, messagesCreated };
  }

  /**
   * Poll Graph conversations into DM threads. Unlike comments there is no post
   * anchor: the conversation is keyed by the Graph conversation id, so the
   * inbox row carries a participant instead of source content.
   */
  async ingestInstagramDms(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.INSTAGRAM,
      options.credentialId,
    );
    let messagesCreated = 0;
    let conversationsCreated = 0;

    for (const credential of credentials) {
      // The Graph conversations edge is reached through the brand's token, so
      // a credential with no brand has no path to poll.
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      const threads = await this.instagramService.listConversations(
        scope.organizationId,
        brandId,
        limit,
        credential.id,
      );

      if (threads.length === 0) {
        continue;
      }

      const existing = await this.findExistingExternalIds(
        scope.organizationId,
        Platform.INSTAGRAM,
        threads.map((thread) => thread.conversationId),
        threads.flatMap((thread) =>
          thread.messages.map((message) => message.messageId),
        ),
      );

      for (const thread of threads) {
        // The Graph messages edge returns reverse-chronological batches;
        // ingest oldest-first so the conversation preview lands on the
        // newest message.
        const orderedMessages = [...thread.messages].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        for (const message of orderedMessages) {
          const isNewConversation = !existing.conversationIds.has(
            thread.conversationId,
          );
          const isNewMessage = !existing.messageIds.has(message.messageId);

          await this.ingestSyncedMessage(
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
              participantHandle:
                message.senderUsername ?? thread.participantUsername,
              participantName: message.senderName ?? thread.participantName,
              platform: Platform.INSTAGRAM,
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

  /**
   * Mentions of the connected X account plus replies on the brand's published
   * posts. Both land as comment conversations so they show on the existing
   * Comments surface.
   */
  async ingestXComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.TWITTER,
      options.credentialId,
    );
    const counts = { conversationsCreated: 0, messagesCreated: 0 };

    for (const credential of credentials) {
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      const mentionCursor = await this.findLatestExternalMessageId({
        credentialId: credential.id,
        messageType: SocialMessageType.COMMENT,
        organizationId: scope.organizationId,
        platform: Platform.TWITTER,
        postId: null,
      });
      const mentions = await this.pollProvider(
        Platform.TWITTER,
        mentionCursor,
        () =>
          this.twitterService.listMentions(
            scope.organizationId,
            brandId,
            { limit, sinceId: mentionCursor },
            credential.id,
          ),
      );

      await this.ingestBatch(
        mentions.map((mention) => ({
          input: {
            ...accountFieldsFromCredential(credential, scope.userId),
            body: mention.text,
            brandId,
            conversationType: SocialConversationType.COMMENT,
            createdAt: mention.createdAt,
            credentialId: credential.id,
            externalConversationId: mention.conversationId,
            externalMessageId: mention.tweetId,
            externalParentId: mention.tweetId,
            externalParentMessageId: mention.inReplyToId ?? undefined,
            externalThreadId: mention.conversationId,
            organizationId: scope.organizationId,
            participantAvatarUrl: mention.authorAvatarUrl,
            participantExternalId: mention.authorId,
            participantHandle: mention.authorUsername,
            participantName: mention.authorName ?? mention.authorUsername,
            platform: Platform.TWITTER,
            sourceContentId: mention.conversationId,
            sourceContentType: 'tweet',
            sourceContentUrl: mention.authorUsername
              ? `https://x.com/${mention.authorUsername}/status/${mention.tweetId}`
              : `https://x.com/i/status/${mention.tweetId}`,
          },
          messageId: mention.tweetId,
          threadId: mention.conversationId,
        })),
        scope.organizationId,
        Platform.TWITTER,
        counts,
      );

      const posts = await this.prisma.post.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 20,
        where: scopedWhere(scope.organizationId, {
          brandId,
          credentialId: credential.id,
          externalId: { not: null },
          platform: Platform.TWITTER,
          status: { in: [PostStatus.PUBLIC] },
        }),
      });

      for (const post of posts) {
        const replyCursor = await this.findLatestExternalMessageId({
          credentialId: credential.id,
          messageType: SocialMessageType.COMMENT,
          organizationId: scope.organizationId,
          platform: Platform.TWITTER,
          postId: post.id,
        });
        const replies = await this.pollProvider(
          Platform.TWITTER,
          replyCursor,
          () =>
            this.twitterService.listPostReplies(
              scope.organizationId,
              brandId,
              String(post.externalId),
              { limit, sinceId: replyCursor },
              credential.id,
            ),
        );

        await this.ingestBatch(
          replies.map((reply) => ({
            input: {
              ...accountFieldsFromCredential(credential, scope.userId),
              body: reply.text,
              brandId: post.brandId,
              conversationType: SocialConversationType.COMMENT,
              createdAt: reply.createdAt,
              credentialId: credential.id,
              externalConversationId: reply.conversationId,
              externalMessageId: reply.tweetId,
              externalParentId: reply.tweetId,
              externalParentMessageId: reply.inReplyToId ?? undefined,
              externalThreadId: reply.conversationId,
              organizationId: scope.organizationId,
              participantAvatarUrl: reply.authorAvatarUrl,
              participantExternalId: reply.authorId,
              participantHandle: reply.authorUsername,
              participantName: reply.authorName ?? reply.authorUsername,
              platform: Platform.TWITTER,
              postId: post.id,
              sourceContentId: String(post.externalId),
              sourceContentTitle: post.label ?? post.description.slice(0, 120),
              sourceContentType: 'tweet',
              sourceContentUrl:
                post.url ?? `https://x.com/i/status/${post.externalId}`,
            },
            messageId: reply.tweetId,
            threadId: reply.conversationId,
          })),
          scope.organizationId,
          Platform.TWITTER,
          counts,
        );
      }
    }

    return counts;
  }

  async ingestXDms(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.TWITTER,
      options.credentialId,
    );
    const counts = { conversationsCreated: 0, messagesCreated: 0 };

    for (const credential of credentials) {
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      // X dm_events paginate with the provider next_token, not a stored
      // message id. Walk newest-first until a page adds nothing new.
      let paginationToken: string | undefined;
      for (let page = 0; page < X_DM_MAX_PAGES; page++) {
        const listing = await this.pollProvider(
          Platform.TWITTER,
          paginationToken,
          () =>
            this.twitterService.listDirectMessages(
              scope.organizationId,
              brandId,
              {
                limit,
                ...(paginationToken ? { paginationToken } : {}),
              },
              credential.id,
            ),
        );
        const createdBefore = counts.messagesCreated;

        for (const thread of listing.threads) {
          const orderedMessages = [...thread.messages].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );

          await this.ingestBatch(
            orderedMessages.map((message) => ({
              input: {
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
                  message.senderId ?? thread.participantExternalId,
                participantHandle:
                  message.senderUsername ?? thread.participantUsername,
                participantName: message.senderName ?? thread.participantName,
                platform: Platform.TWITTER,
              },
              messageId: message.messageId,
              threadId: thread.conversationId,
            })),
            scope.organizationId,
            Platform.TWITTER,
            counts,
          );
        }

        paginationToken = listing.nextToken;
        if (!paginationToken || counts.messagesCreated === createdBefore) {
          break;
        }
      }
    }

    return counts;
  }

  async ingestLinkedInComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
    const credentials = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.LINKEDIN,
      options.credentialId,
    );
    const counts = { conversationsCreated: 0, messagesCreated: 0 };

    for (const credential of credentials) {
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      const posts = await this.prisma.post.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 20,
        where: scopedWhere(scope.organizationId, {
          brandId,
          credentialId: credential.id,
          externalId: { not: null },
          platform: Platform.LINKEDIN,
          status: { in: [PostStatus.PUBLIC] },
        }),
      });

      for (const post of posts) {
        const start = await this.countExistingMessages({
          organizationId: scope.organizationId,
          platform: Platform.LINKEDIN,
          postId: post.id,
        });
        const comments = await this.pollProvider(
          Platform.LINKEDIN,
          String(start),
          () =>
            this.linkedInService.listPostComments(
              scope.organizationId,
              brandId,
              String(post.externalId),
              { limit, start },
            ),
        );

        await this.ingestBatch(
          comments.map((comment) => ({
            input: {
              ...accountFieldsFromCredential(credential, scope.userId),
              body: comment.text,
              brandId: post.brandId,
              conversationType: SocialConversationType.COMMENT,
              createdAt: comment.createdAt,
              credentialId: credential.id,
              externalConversationId: comment.threadId,
              externalMessageId: comment.commentId,
              externalParentId: comment.commentId,
              externalThreadId: comment.threadId,
              organizationId: scope.organizationId,
              participantExternalId: comment.authorExternalId,
              participantName: comment.authorName ?? comment.authorExternalId,
              platform: Platform.LINKEDIN,
              postId: post.id,
              sourceContentId: String(post.externalId),
              sourceContentTitle: post.label ?? post.description.slice(0, 120),
              sourceContentType: 'post',
              sourceContentUrl: post.url ?? undefined,
            },
            messageId: comment.commentId,
            threadId: comment.threadId,
          })),
          scope.organizationId,
          Platform.LINKEDIN,
          counts,
        );
      }
    }

    return counts;
  }

  /**
   * LinkedIn DMs only ingest when the connected-account grant includes a
   * mailbox scope. The standard `w_member_social` path is not permitted.
   */
  async ingestLinkedInDms(
    scope: SocialInboxScope,
    options: { credentialId?: string } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const credentials = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.LINKEDIN,
      options.credentialId,
    );
    const counts = { conversationsCreated: 0, messagesCreated: 0 };

    for (const credential of credentials) {
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      const listing = await this.pollProvider(
        Platform.LINKEDIN,
        undefined,
        () =>
          this.linkedInService.listDirectMessages(
            scope.organizationId,
            brandId,
            credential.id,
          ),
      );

      if (!listing.isPermitted) {
        continue;
      }

      if (listing.isImplemented === false) {
        throw new SocialInboxProviderError(
          listing.reason ?? LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
          { platform: Platform.LINKEDIN },
        );
      }

      for (const thread of listing.threads) {
        const orderedMessages = [...thread.messages].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        await this.ingestBatch(
          orderedMessages.map((message) => ({
            input: {
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
              platform: Platform.LINKEDIN,
            },
            messageId: message.messageId,
            threadId: thread.conversationId,
          })),
          scope.organizationId,
          Platform.LINKEDIN,
          counts,
        );
      }
    }

    return counts;
  }

  /**
   * Batched dedup lookup for one sync batch: one findMany per entity keyed by
   * the external ids, replacing the per-item findFirst pair. Org scoping
   * ({ organizationId, isDeleted: false }) is preserved. Returns the rows that
   * already exist keyed by external id so the caller can both count net-new
   * ingests and skip the per-item lookups for known items entirely.
   */
  private async findExistingExternalIds(
    organizationId: string,
    platform: string,
    threadIds: string[],
    commentIds: string[],
  ): Promise<{
    conversationIds: Set<string>;
    conversationsByExternalId: Map<string, SocialConversationDocument>;
    messageIds: Set<string>;
    messagesByExternalId: Map<string, SocialMessageDocument>;
  }> {
    const uniqueThreadIds = [...new Set(threadIds)];
    const uniqueCommentIds = [...new Set(commentIds)];

    const [conversations, messages] = await Promise.all([
      uniqueThreadIds.length
        ? this.prisma.socialConversation.findMany({
            where: scopedWhere(organizationId, {
              externalConversationId: { in: uniqueThreadIds },
              platform,
            }),
          })
        : Promise.resolve([]),
      uniqueCommentIds.length
        ? this.prisma.socialMessage.findMany({
            where: scopedWhere(organizationId, {
              externalMessageId: { in: uniqueCommentIds },
              platform,
            }),
          })
        : Promise.resolve([]),
    ]);

    const conversationsByExternalId = new Map<
      string,
      SocialConversationDocument
    >(
      conversations
        .filter((row) => Boolean(row.externalConversationId))
        .map((row) => [String(row.externalConversationId), row]),
    );
    const messagesByExternalId = new Map<string, SocialMessageDocument>(
      messages
        .filter((row) => Boolean(row.externalMessageId))
        .map((row) => [String(row.externalMessageId), row]),
    );

    return {
      conversationIds: new Set(conversationsByExternalId.keys()),
      conversationsByExternalId,
      messageIds: new Set(messagesByExternalId.keys()),
      messagesByExternalId,
    };
  }

  /**
   * Ingest one synced item: already-known messages skip the per-item
   * findOrCreateConversation + findFirst pair (the batched dedup already
   * proved they exist) but still run the workflow trigger claim, which is a
   * deliberate retry path for triggers that previously failed to enqueue.
   */
  private async ingestSyncedMessage(
    input: InboundSocialMessageInput,
    knownMessage: SocialMessageDocument | undefined,
    knownConversation: SocialConversationDocument | undefined,
  ): Promise<void> {
    if (knownMessage && knownConversation) {
      await this.queueCommentTrigger(input, knownMessage, knownConversation);
      return;
    }

    await this.ingestInboundMessage(input);
  }

  private async ingestBatch(
    items: Array<{
      input: InboundSocialMessageInput;
      messageId: string;
      threadId: string;
    }>,
    organizationId: string,
    platform: string,
    counts: { conversationsCreated: number; messagesCreated: number },
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const existing = await this.findExistingExternalIds(
      organizationId,
      platform,
      items.map((item) => item.threadId),
      items.map((item) => item.messageId),
    );

    for (const item of items) {
      const isNewConversation = !existing.conversationIds.has(item.threadId);
      const isNewMessage = !existing.messageIds.has(item.messageId);

      await this.ingestSyncedMessage(
        item.input,
        existing.messagesByExternalId.get(item.messageId),
        existing.conversationsByExternalId.get(item.threadId),
      );

      if (isNewMessage) {
        counts.messagesCreated++;
        existing.messageIds.add(item.messageId);
      }
      if (isNewConversation) {
        counts.conversationsCreated++;
        existing.conversationIds.add(item.threadId);
      }
    }
  }

  private async pollProvider<T>(
    platform: string,
    cursor: string | undefined,
    list: () => Promise<T>,
  ): Promise<T> {
    try {
      return await list();
    } catch (error: unknown) {
      const isRateLimited = isProviderRateLimit(error);
      this.logger?.warn('Social inbox provider poll failed', {
        cursor,
        isRateLimited,
        platform,
      });
      throw new SocialInboxProviderError(
        error instanceof Error ? error.message : String(error),
        {
          cause: error,
          cursor,
          isRateLimited,
          platform,
        },
      );
    }
  }

  private async findLatestExternalMessageId(query: {
    organizationId: string;
    platform: string;
    credentialId: string;
    messageType: string;
    postId?: string | null;
  }): Promise<string | undefined> {
    const latest = await this.prisma.socialMessage.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { externalMessageId: true },
      where: scopedWhere(query.organizationId, {
        credentialId: query.credentialId,
        messageType: query.messageType,
        platform: query.platform,
        ...(query.postId === undefined ? {} : { postId: query.postId }),
        externalMessageId: { not: null },
      }),
    });

    return latest?.externalMessageId ?? undefined;
  }

  private async countExistingMessages(query: {
    organizationId: string;
    platform: string;
    postId: string;
  }): Promise<number> {
    return this.prisma.socialMessage.count({
      where: scopedWhere(query.organizationId, {
        platform: query.platform,
        postId: query.postId,
      }),
    });
  }

  private async findConnectedCredentials(
    scope: SocialInboxScope,
    platform: PrismaCredentialPlatform,
    credentialId?: string,
  ) {
    return this.prisma.credential.findMany({
      where: scopedWhere(scope.organizationId, {
        ...(credentialId ? { id: credentialId } : {}),
        ...(scope.brandId ? { brandId: scope.brandId } : {}),
        isConnected: true,
        platform,
      }),
    });
  }

  private async findOrCreateConversation(
    input: InboundSocialMessageInput & {
      availability: SocialConversationAvailability;
      body: string;
      createdAt: Date;
      platform: string;
    },
  ): Promise<SocialConversationDocument> {
    const existing = await this.prisma.socialConversation.findFirst({
      where: scopedWhere(input.organizationId, {
        externalConversationId: input.externalConversationId,
        platform: input.platform,
      }),
    });

    if (existing) {
      return existing;
    }

    let created: Awaited<
      ReturnType<typeof this.prisma.socialConversation.create>
    >;
    try {
      created = await this.prisma.socialConversation.create({
        data: {
          accountExternalId: clamp(input.accountExternalId, 512),
          accountHandle: clamp(input.accountHandle, 280),
          accountName: clamp(input.accountName, 280),
          availability: input.availability as unknown as Prisma.InputJsonValue,
          automationState: 'manual',
          brandId: input.brandId,
          conversationType: input.conversationType,
          credentialId: input.credentialId,
          externalConversationId: input.externalConversationId,
          externalParentId: clamp(input.externalParentId, 512),
          externalThreadId: clamp(input.externalThreadId, 512),
          lastInboundAt: input.createdAt,
          latestMessageAt: input.createdAt,
          latestMessageText: clamp(input.body, 500),
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          organizationId: input.organizationId,
          participantAvatarUrl: clamp(input.participantAvatarUrl, 2048),
          participantExternalId: clamp(input.participantExternalId, 512),
          participantHandle: clamp(input.participantHandle, 280),
          participantName: clamp(input.participantName, 280),
          platform: input.platform,
          postId: input.postId,
          sourceContentId: clamp(input.sourceContentId, 512),
          sourceContentTitle: clamp(input.sourceContentTitle, 500),
          sourceContentType: clamp(input.sourceContentType, 100),
          sourceContentUrl: clamp(input.sourceContentUrl, 2048),
          status: 'open',
          unreadCount: 0,
          userId: input.userId,
        },
      });
    } catch (error) {
      // Concurrent ingestion (webhook + cron) can race the findFirst above;
      // the unique (organizationId, platform, externalConversationId) makes
      // the loser throw P2002 — recover by returning the winner's row.
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error;
      }
      const winner = await this.prisma.socialConversation.findFirst({
        where: scopedWhere(input.organizationId, {
          externalConversationId: input.externalConversationId,
          platform: input.platform,
        }),
      });
      if (!winner) {
        throw error;
      }
      return winner;
    }

    return created;
  }

  private async queueCommentTrigger(
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
  ): Promise<void> {
    const userId = input.userId ?? message.userId ?? undefined;
    const queueService = this.workflowExecutionQueueService;
    if (!queueService || !userId) {
      return;
    }

    const claim = await this.claimCommentTrigger(input, message, conversation);
    if (!claim) {
      return;
    }

    let queuedJobId: string;
    try {
      queuedJobId = await this.enqueueCommentTrigger(
        input,
        message,
        conversation,
        userId,
        claim.jobId,
        queueService,
      );
    } catch (error: unknown) {
      await this.finalizeFailedCommentTrigger(
        input,
        message,
        conversation,
        claim.attemptedAt,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    await this.finalizeQueuedCommentTrigger(
      input,
      message,
      conversation,
      claim.attemptedAt,
      queuedJobId,
    );
  }

  private async claimCommentTrigger(
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
  ): Promise<WorkflowTriggerClaim | null> {
    const attemptedAt = new Date();
    const staleClaimBefore = new Date(
      attemptedAt.getTime() - WORKFLOW_TRIGGER_CLAIM_TIMEOUT_MS,
    );
    const jobId = [
      'social-comment-trigger',
      input.organizationId,
      message.id,
    ].join('-');
    const claim = await this.prisma.socialMessage.updateMany({
      data: {
        workflowTriggerAttemptedAt: attemptedAt,
        workflowTriggerError: null,
        workflowTriggerJobId: jobId,
        workflowTriggerStatus: 'enqueueing',
      },
      where: scopedWhere(input.organizationId, {
        conversationId: conversation.id,
        id: message.id,
        OR: [
          { workflowTriggerStatus: null },
          { workflowTriggerStatus: { in: ['pending', 'failed'] } },
          {
            workflowTriggerAttemptedAt: { lt: staleClaimBefore },
            workflowTriggerStatus: 'enqueueing',
          },
        ],
      }),
    });

    return claim.count === 0 ? null : { attemptedAt, jobId };
  }

  private enqueueCommentTrigger(
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
    userId: string,
    jobId: string,
    queueService: WorkflowExecutionQueueService,
  ): Promise<string> {
    return queueService.queueTriggerEvent(
      {
        data: {
          authorId: input.participantExternalId,
          authorUsername: input.participantHandle ?? input.participantName,
          brandId: input.brandId,
          commentId: input.externalMessageId,
          contentId: input.sourceContentId,
          contentUrl: input.sourceContentUrl,
          conversationId: conversation.id,
          credentialId: input.credentialId,
          externalMessageId: input.externalMessageId,
          externalParentId: input.externalParentId,
          messageId: message.id,
          parentId: input.externalParentId,
          platform: conversation.platform,
          postId:
            input.externalParentId ??
            input.externalMessageId ??
            input.sourceContentId,
          postUrl: input.sourceContentUrl,
          sourceContentId: input.sourceContentId,
          text: message.body,
        },
        organizationId: input.organizationId,
        platform: conversation.platform,
        type: 'commentTrigger',
        userId,
      },
      { jobId },
    );
  }

  private async finalizeFailedCommentTrigger(
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const finalized = await transaction.socialMessage.updateMany({
        data: {
          workflowTriggerError: errorMessage,
          workflowTriggerStatus: 'failed',
        },
        where: scopedWhere(input.organizationId, {
          conversationId: conversation.id,
          id: message.id,
          workflowTriggerAttemptedAt: attemptedAt,
          workflowTriggerStatus: 'enqueueing',
        }),
      });
      if (finalized.count === 0) {
        return;
      }

      const freshConversation = await transaction.socialConversation.findFirst({
        where: scopedWhere(input.organizationId, { id: conversation.id }),
      });
      if (!freshConversation) {
        return;
      }

      await transaction.socialConversation.updateMany({
        data: {
          automationState: 'failed',
          metadata: {
            ...asRecord(freshConversation.metadata),
            workflowTriggerError: errorMessage,
            workflowTriggerFailedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
        where: scopedWhere(input.organizationId, { id: conversation.id }),
      });
    });
  }

  private async finalizeQueuedCommentTrigger(
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
    attemptedAt: Date,
    queuedJobId: string,
  ): Promise<void> {
    const queuedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const finalized = await transaction.socialMessage.updateMany({
        data: {
          workflowTriggerError: null,
          workflowTriggerJobId: queuedJobId,
          workflowTriggerQueuedAt: queuedAt,
          workflowTriggerStatus: 'queued',
        },
        where: scopedWhere(input.organizationId, {
          conversationId: conversation.id,
          id: message.id,
          workflowTriggerAttemptedAt: attemptedAt,
          workflowTriggerStatus: 'enqueueing',
        }),
      });
      if (finalized.count === 0) {
        return;
      }

      const freshConversation = await transaction.socialConversation.findFirst({
        where: scopedWhere(input.organizationId, { id: conversation.id }),
      });
      if (!freshConversation) {
        return;
      }
      const freshMetadata = asRecord(freshConversation.metadata);

      await transaction.socialConversation.updateMany({
        data: {
          automationState:
            freshConversation.automationState === 'failed' &&
            typeof freshMetadata.workflowTriggerFailedAt === 'string'
              ? 'manual'
              : freshConversation.automationState,
          metadata: {
            ...freshMetadata,
            lastWorkflowTriggerJobId: queuedJobId,
            lastWorkflowTriggeredAt: queuedAt.toISOString(),
            workflowTriggerError: null,
            workflowTriggerFailedAt: null,
          } as Prisma.InputJsonValue,
        },
        where: scopedWhere(input.organizationId, { id: conversation.id }),
      });
    });
  }
}
