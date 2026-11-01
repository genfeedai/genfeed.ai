import {
  OWNED_INBOX_POST_ORDER_BY,
  ownedPublicInboxPostFilter,
  publicYoutubeInboxPostFilter,
} from '@api/collections/posts/services/post-publication-capture.filters';
import type {
  SocialConversationDocument,
  SocialMessage,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import { queueSocialCommentTrigger } from '@api/collections/social-inbox/services/ingestion/comment-trigger-ingestion';
import {
  accountFieldsFromCredential,
  ingestInboundSocialMessage,
  type SyncedItem,
  toXPostReplyItem,
} from '@api/collections/social-inbox/services/ingestion/inbound-message-ingestion';
import {
  isProviderForbidden,
  isProviderRateLimit,
} from '@api/collections/social-inbox/services/ingestion/provider-poll-errors.util';
import {
  boundLimit,
  LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
  X_DM_RECONNECT_REASON,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  CreatedSocialMessageRef,
  InboundSocialMessageInput,
  SocialInboxScope,
  XPostRepliesIngestInput,
  XPostRepliesIngestResult,
  YoutubeCommentIngestResult,
} from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxProviderError } from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { ingestOwnedYoutubeComments } from '@api/collections/social-inbox/services/youtube-comment-ingestion';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import { scopedWhere } from '@api/index';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  SocialConversationType,
  SocialMessageType,
} from '@genfeedai/contracts';
import { resolveDirectMessageCapability } from '@genfeedai/helpers';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const X_DM_MAX_PAGES = 5;

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
    return resolveOptionalProvider(
      this.moduleRef,
      WorkflowExecutionQueueService,
    );
  }

  async ingestInboundMessage(
    input: InboundSocialMessageInput,
  ): Promise<SocialMessageDocument> {
    return ingestInboundSocialMessage(input, {
      hasWorkflowQueue: () => Boolean(this.workflowExecutionQueueService),
      prisma: this.prisma,
      queueCommentTrigger: (inbound, message, conversation) =>
        this.queueCommentTrigger(inbound, message, conversation),
      realtime: this.realtimeService,
    });
  }

  async ingestYoutubeComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<YoutubeCommentIngestResult> {
    return ingestOwnedYoutubeComments(scope, options, {
      accountFields: (credential) =>
        accountFieldsFromCredential(credential, scope.userId),
      findConnectedCredentials: (inboxScope, credentialId) =>
        this.findConnectedCredentials(
          inboxScope,
          PrismaCredentialPlatform.YOUTUBE,
          credentialId,
        ),
      findExistingExternalIds: (organizationId, threadIds, commentIds) =>
        this.findExistingExternalIds(
          organizationId,
          Platform.YOUTUBE,
          threadIds,
          commentIds,
        ),
      findOwnedPosts: (organizationId, credential) =>
        this.prisma.post.findMany({
          orderBy: OWNED_INBOX_POST_ORDER_BY,
          take: 20,
          where: scopedWhere(
            organizationId,
            publicYoutubeInboxPostFilter(credential),
          ),
        }),
      ingestSyncedMessage: (input, knownMessage, knownConversation) =>
        this.ingestSyncedMessage(input, knownMessage, knownConversation),
      listVideoComments: (
        organizationId,
        brandId,
        videoId,
        limit,
        credentialId,
      ) =>
        this.youtubeService.listVideoComments(
          organizationId,
          brandId,
          videoId,
          limit,
          credentialId,
        ),
      warn: (message, context) => {
        this.logger?.warn(message, context);
      },
    });
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
        orderBy: OWNED_INBOX_POST_ORDER_BY,
        take: 20,
        where: scopedWhere(
          scope.organizationId,
          ownedPublicInboxPostFilter(
            Platform.INSTAGRAM,
            credential.id,
            credential.brandId,
          ),
        ),
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
        orderBy: OWNED_INBOX_POST_ORDER_BY,
        take: 20,
        where: scopedWhere(
          scope.organizationId,
          ownedPublicInboxPostFilter(Platform.TWITTER, credential.id, brandId),
        ),
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
          replies.map((reply) =>
            toXPostReplyItem(credential, scope, post, reply),
          ),
          scope.organizationId,
          Platform.TWITTER,
          counts,
        );
      }
    }

    return counts;
  }

  /**
   * Store X replies the caller already fetched and matched to one of the
   * credential's own posts. No provider call happens here; the reply watch
   * reads them from the account's mentions timeline. Each reply is grouped
   * under its post's conversation, exactly like the per-post sync above.
   */
  async ingestXPostReplies(
    scope: SocialInboxScope,
    input: XPostRepliesIngestInput,
  ): Promise<XPostRepliesIngestResult> {
    const counts = { conversationsCreated: 0, messagesCreated: 0 };
    const createdMessages: CreatedSocialMessageRef[] = [];
    const [credential] = await this.findConnectedCredentials(
      scope,
      PrismaCredentialPlatform.TWITTER,
      input.credentialId,
    );
    if (!credential?.brandId || input.replies.length === 0) {
      return { ...counts, createdMessages };
    }

    await this.ingestBatch(
      input.replies.flatMap(({ post, reply }) =>
        post.brandId === credential.brandId && post.externalId
          ? [
              toXPostReplyItem(credential, scope, post, {
                ...reply,
                conversationId: String(post.externalId),
              }),
            ]
          : [],
      ),
      scope.organizationId,
      Platform.TWITTER,
      counts,
      createdMessages,
    );

    return { ...counts, createdMessages };
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
    const missingPermissionCredentialIds: string[] = [];

    for (const credential of credentials) {
      const brandId = credential.brandId;
      if (!brandId) {
        continue;
      }

      // A grant captured without dm.read cannot read DMs; calling X would
      // only earn a 403. Skip it and fail the sync with a typed reason below.
      if (
        resolveDirectMessageCapability({
          grantedScopes: credential.grantedScopes,
          grantedScopesCapturedAt: credential.grantedScopesCapturedAt,
          platform: Platform.TWITTER,
        }) === 'reconnect'
      ) {
        missingPermissionCredentialIds.push(credential.id);
        continue;
      }

      // X dm_events paginate with the provider next_token, not a stored
      // message id. Walk newest-first until a page adds nothing new.
      let paginationToken: string | undefined;
      for (let page = 0; page < X_DM_MAX_PAGES; page++) {
        let listing: Awaited<ReturnType<TwitterService['listDirectMessages']>>;
        try {
          listing = await this.pollProvider(
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
        } catch (error: unknown) {
          // A grant from before scope capture is only found out here.
          if (
            error instanceof SocialInboxProviderError &&
            isProviderForbidden(error.cause)
          ) {
            missingPermissionCredentialIds.push(credential.id);
            break;
          }
          throw error;
        }
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

    // Accounts that could be read were ingested above; the sync still fails
    // so the inbox shows why the others stayed empty instead of looking idle.
    if (missingPermissionCredentialIds.length > 0) {
      throw new SocialInboxProviderError(X_DM_RECONNECT_REASON, {
        credentialIds: missingPermissionCredentialIds,
        platform: Platform.TWITTER,
        reason: 'missing_permission',
      });
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
        orderBy: OWNED_INBOX_POST_ORDER_BY,
        take: 20,
        where: scopedWhere(
          scope.organizationId,
          ownedPublicInboxPostFilter(Platform.LINKEDIN, credential.id, brandId),
        ),
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

  /** LinkedIn DMs require mailbox scope; `w_member_social` does not permit them. */
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
  ): Promise<string> {
    if (knownMessage && knownConversation) {
      await this.queueCommentTrigger(input, knownMessage, knownConversation);
      return knownConversation.id;
    }

    return (await this.ingestInboundMessage(input)).conversationId;
  }

  private async ingestBatch(
    items: SyncedItem[],
    organizationId: string,
    platform: string,
    counts: { conversationsCreated: number; messagesCreated: number },
    createdMessages?: CreatedSocialMessageRef[],
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

      const conversationId = await this.ingestSyncedMessage(
        item.input,
        existing.messagesByExternalId.get(item.messageId),
        existing.conversationsByExternalId.get(item.threadId),
      );

      if (isNewMessage) {
        counts.messagesCreated++;
        existing.messageIds.add(item.messageId);
        createdMessages?.push({
          conversationId,
          externalMessageId: item.messageId,
        });
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
        ...(scope.brandId && !credentialId ? { brandId: scope.brandId } : {}),
        isConnected: true,
        platform,
      }),
    });
  }

  private async queueCommentTrigger(
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
  ): Promise<void> {
    return queueSocialCommentTrigger(input, message, conversation, {
      prisma: this.prisma,
      queueService: this.workflowExecutionQueueService,
    });
  }
}
