import type {
  SocialConversation,
  SocialConversationAvailability,
  SocialConversationDocument,
  SocialMessage,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { PostStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
} from '@nestjs/common';

export interface SocialInboxScope {
  organizationId: string;
  userId?: string;
  brandId?: string;
}

export interface SocialInboxListQuery {
  page?: number;
  limit?: number;
  platform?: string;
  status?: string;
  automationState?: string;
  conversationType?: string;
  credentialId?: string;
  assignedOwnerId?: string;
  tag?: string;
  search?: string;
  unread?: boolean;
  needsReview?: boolean;
}

export interface InboundSocialMessageInput {
  organizationId: string;
  brandId?: string;
  credentialId?: string;
  postId?: string;
  platform: string;
  conversationType: string;
  externalConversationId: string;
  externalThreadId?: string;
  externalParentId?: string;
  externalMessageId: string;
  externalParentMessageId?: string;
  body: string;
  sourceContentId?: string;
  sourceContentUrl?: string;
  sourceContentTitle?: string;
  sourceContentType?: string;
  accountExternalId?: string;
  accountHandle?: string;
  accountName?: string;
  participantExternalId?: string;
  participantHandle?: string;
  participantName?: string;
  participantAvatarUrl?: string;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export interface SocialActionInput {
  text: string;
  idempotencyKey?: string;
  workflowRunId?: string;
  agentRunId?: string;
  recipientId?: string;
  messageType?: 'dm' | 'reply';
}

export interface SocialConversationPatch {
  status?: string;
  tags?: string[];
  assignedOwnerId?: string | null;
}

export type SocialInboxPage<T> = {
  docs: T[];
  total: number;
  totalDocs: number;
  limit: number;
  page: number;
  pages: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

type JsonRecord = Record<string, unknown>;
type OutboundAction = 'post_reply' | 'send_dm';
type OutboundMessageType = 'dm' | 'reply';
type OutboundPublishResult = { messageId: string; url?: string };
type OutboundReservation = {
  isClaimed: boolean;
  message: SocialMessageDocument;
};

const SUPPORTED_PLATFORMS = new Set(['youtube', 'instagram']);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const WORKFLOW_TRIGGER_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class SocialInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService,
    private readonly instagramService: InstagramService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
  ) {}

  async listConversations(
    scope: SocialInboxScope,
    query: SocialInboxListQuery,
  ): Promise<SocialInboxPage<SocialConversationDocument>> {
    const page = this.boundPage(query.page);
    const limit = this.boundLimit(query.limit);
    const where = this.buildConversationWhere(scope, query);
    const [docs, totalDocs] = await Promise.all([
      this.prisma.socialConversation.findMany({
        orderBy: [
          { latestMessageAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.socialConversation.count({ where }),
    ]);

    return this.page(
      docs.map((doc) => this.toConversationDocument(doc)),
      totalDocs,
      page,
      limit,
    );
  }

  async getConversation(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<SocialConversationDocument> {
    const conversation = await findOrThrow(
      this.prisma.socialConversation,
      { where: this.buildConversationIdentityWhere(scope, conversationId) },
      'Social conversation',
    );

    return this.toConversationDocument(conversation);
  }

  async listMessages(
    scope: SocialInboxScope,
    conversationId: string,
    options: { cursor?: string; limit?: number; page?: number } = {},
  ): Promise<SocialInboxPage<SocialMessageDocument>> {
    await this.getConversation(scope, conversationId);

    const limit = this.boundLimit(options.limit ?? 50);
    const page = this.boundPage(options.page);
    const where: Prisma.SocialMessageWhereInput = {
      conversationId,
      isDeleted: false,
      organizationId: scope.organizationId,
    };

    const [docs, totalDocs] = await Promise.all([
      this.prisma.socialMessage.findMany({
        cursor: options.cursor ? { id: options.cursor } : undefined,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: options.cursor ? 1 : (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.socialMessage.count({ where }),
    ]);

    return this.page(
      docs.map((doc) => this.toMessageDocument(doc)).reverse(),
      totalDocs,
      page,
      limit,
    );
  }

  async ingestInboundMessage(
    input: InboundSocialMessageInput,
  ): Promise<SocialMessageDocument> {
    const platform = this.normalizePlatform(input.platform);
    const body = this.sanitizeBody(input.body);
    const messageCreatedAt = input.createdAt ?? new Date();
    const availability = this.getAvailability({
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
      where: {
        externalMessageId: input.externalMessageId,
        isDeleted: false,
        organizationId: input.organizationId,
        platform,
      },
    });

    if (existing) {
      await this.queueCommentTrigger(input, existing, conversation);
      return this.toMessageDocument(existing);
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
          messageType: input.conversationType === 'dm' ? 'dm' : 'comment',
          organizationId: input.organizationId,
          platform,
          postId: input.postId,
          senderAvatarUrl: this.clamp(input.participantAvatarUrl, 2048),
          senderExternalId: this.clamp(input.participantExternalId, 512),
          senderHandle: this.clamp(input.participantHandle, 280),
          senderName: this.clamp(input.participantName, 280),
          sourceUrl: this.clamp(input.sourceContentUrl, 2048),
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
        where: {
          externalMessageId: input.externalMessageId,
          isDeleted: false,
          organizationId: input.organizationId,
          platform,
        },
      });
      if (!winner) {
        throw error;
      }
      await this.queueCommentTrigger(input, winner, conversation);
      return this.toMessageDocument(winner);
    }

    await this.prisma.socialConversation.update({
      data: {
        latestMessageAt: messageCreatedAt,
        latestMessageText: this.clamp(body, 500),
        lastInboundAt: messageCreatedAt,
        unreadCount: { increment: 1 },
        updatedAt: new Date(),
      },
      where: { id: conversation.id },
    });

    await this.queueCommentTrigger(input, message, conversation);

    return this.toMessageDocument(message);
  }

  async createDraft(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const conversation = await this.getConversation(scope, conversationId);
    const body = this.sanitizeBody(input.text);

    const message = await this.prisma.socialMessage.create({
      data: {
        actionProvenance: this.buildActionProvenance({
          action: 'draft',
          conversation,
          input,
          scope,
          status: 'draft',
        }) as Prisma.InputJsonValue,
        agentRunId: input.agentRunId,
        body,
        brandId: conversation.brandId,
        conversationId: conversation.id,
        credentialId: conversation.credentialId,
        direction: 'outbound',
        messageType: input.messageType === 'dm' ? 'dm' : 'reply',
        metadata: {
          draftRecipientId: input.recipientId,
        } as Prisma.InputJsonValue,
        organizationId: conversation.organizationId,
        platform: conversation.platform,
        postId: conversation.postId,
        status: 'draft',
        userId: scope.userId,
        workflowRunId: input.workflowRunId,
      },
    });

    await this.prisma.socialConversation.update({
      data: {
        automationState: 'drafted',
        latestMessageAt: message.createdAt,
        latestMessageText: this.clamp(body, 500),
        needsReview: true,
        updatedAt: new Date(),
      },
      where: { id: conversation.id },
    });

    return this.toMessageDocument(message);
  }

  async approveDraft(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
  ): Promise<SocialMessageDocument> {
    const draft = await this.getDraftMessage(scope, conversationId, messageId);
    const draftMetadata = this.asRecord(draft.metadata);
    const input: SocialActionInput = {
      agentRunId: draft.agentRunId ?? undefined,
      idempotencyKey: `draft:${draft.id}:approve`,
      recipientId:
        typeof draftMetadata.draftRecipientId === 'string'
          ? draftMetadata.draftRecipientId
          : undefined,
      text: draft.body,
      workflowRunId: draft.workflowRunId ?? undefined,
    };

    const sent =
      draft.messageType === 'dm'
        ? await this.sendDm(scope, conversationId, input)
        : await this.postReply(scope, conversationId, input);

    await this.prisma.socialMessage.update({
      data: {
        actionProvenance: {
          ...this.asRecord(draft.actionProvenance),
          approvedAt: new Date().toISOString(),
          approvedBy: scope.userId,
          approvedMessageId: sent.id,
        } as Prisma.InputJsonValue,
        status: 'approved',
      },
      where: { id: draft.id },
    });

    return sent;
  }

  async rejectDraft(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
    reason?: string,
  ): Promise<SocialMessageDocument> {
    const draft = await this.getDraftMessage(scope, conversationId, messageId);
    const rejected = await this.prisma.socialMessage.update({
      data: {
        actionProvenance: {
          ...this.asRecord(draft.actionProvenance),
          rejectedAt: new Date().toISOString(),
          rejectedBy: scope.userId,
        } as Prisma.InputJsonValue,
        failureReason: this.clamp(reason, 1000),
        status: 'rejected',
      },
      where: { id: draft.id },
    });

    await this.prisma.socialConversation.update({
      data: {
        automationState: 'manual',
        needsReview: false,
        updatedAt: new Date(),
      },
      where: { id: conversationId },
    });

    return this.toMessageDocument(rejected);
  }

  async postReply(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const conversation = await this.getConversation(scope, conversationId);
    const availability = this.readAvailability(conversation);
    if (!availability.canPostReply) {
      throw new BadRequestException(
        availability.postReplyReason ?? 'Reply is not available',
      );
    }

    const body = this.sanitizeBody(input.text);
    return await this.executeOutboundAction(
      'post_reply',
      'reply',
      conversation,
      scope,
      input,
      body,
      () => this.publishReply(conversation, body),
    );
  }

  async sendDm(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const conversation = await this.getConversation(scope, conversationId);
    const availability = this.readAvailability(conversation);
    if (!availability.canSendDm) {
      throw new BadRequestException(
        availability.sendDmReason ?? 'DM is not available',
      );
    }

    const body = this.sanitizeBody(input.text);
    return await this.executeOutboundAction(
      'send_dm',
      'dm',
      conversation,
      scope,
      input,
      body,
      () =>
        this.publishDm(conversation, {
          recipientId: input.recipientId,
          text: body,
        }),
    );
  }

  async updateConversation(
    scope: SocialInboxScope,
    conversationId: string,
    patch: SocialConversationPatch,
  ): Promise<SocialConversationDocument> {
    await this.getConversation(scope, conversationId);

    const data: Prisma.SocialConversationUpdateInput = {};

    if (patch.status !== undefined) {
      data.status = patch.status;
      data.needsReview = patch.status === 'needs_review';
      if (patch.status === 'resolved') {
        data.unreadCount = 0;
      }
    }

    if (patch.tags !== undefined) {
      data.tags = [
        ...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean)),
      ].slice(0, 20);
    }

    if (patch.assignedOwnerId !== undefined) {
      data.assignedOwnerId = patch.assignedOwnerId ?? null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No conversation fields to update');
    }

    const updated = await this.prisma.socialConversation.update({
      data,
      where: { id: conversationId },
    });

    return this.toConversationDocument(updated);
  }

  async ingestYoutubeComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = this.boundLimit(options.limit ?? 25);
    const credentials = await this.findYoutubeCredentials(
      scope,
      options.credentialId,
    );
    let messagesCreated = 0;
    let conversationsCreated = 0;

    for (const credential of credentials) {
      const posts = await this.prisma.post.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 20,
        where: {
          brandId: credential.brandId ?? undefined,
          credentialId: credential.id,
          externalId: { not: null },
          isDeleted: false,
          organizationId: scope.organizationId,
          platform: 'youtube',
          status: { in: [PostStatus.PUBLIC] },
        },
      });

      for (const post of posts) {
        const comments = await this.youtubeService.listVideoComments(
          scope.organizationId,
          post.brandId,
          String(post.externalId),
          limit,
        );

        if (comments.length === 0) {
          continue;
        }

        // Resolve which external ids already exist in one findMany pair for the
        // whole post instead of a findFirst pair per comment. The sets are
        // seeded from the DB snapshot and grown as we ingest so duplicates
        // sharing a thread within the same batch are only counted once.
        const existing = await this.findExistingYoutubeExternalIds(
          scope.organizationId,
          comments.map((comment) => comment.threadId),
          comments.map((comment) => comment.commentId),
        );

        for (const comment of comments) {
          const isNewConversation = !existing.conversationIds.has(
            comment.threadId,
          );
          const isNewMessage = !existing.messageIds.has(comment.commentId);

          await this.ingestInboundMessage({
            accountExternalId: credential.externalId ?? undefined,
            accountHandle:
              credential.externalHandle ?? credential.username ?? undefined,
            accountName:
              credential.externalName ?? credential.label ?? undefined,
            body: comment.text,
            brandId: post.brandId,
            conversationType: 'comment',
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
            platform: 'youtube',
            postId: post.id,
            sourceContentId: String(post.externalId),
            sourceContentTitle: post.label ?? post.description.slice(0, 120),
            sourceContentType: 'video',
            sourceContentUrl:
              post.url ?? `https://www.youtube.com/watch?v=${post.externalId}`,
            userId: credential.userId ?? scope.userId,
          });

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
   * Batched dedup lookup for a single post's comments: one findMany per entity
   * keyed by the external ids, replacing the per-comment findFirst pair. Org
   * scoping ({ organizationId, isDeleted: false }) is preserved. Returns the
   * sets of external ids that already exist so the caller can decide which
   * ingests are net-new without re-querying.
   */
  private async findExistingYoutubeExternalIds(
    organizationId: string,
    threadIds: string[],
    commentIds: string[],
  ): Promise<{ conversationIds: Set<string>; messageIds: Set<string> }> {
    const uniqueThreadIds = [...new Set(threadIds)];
    const uniqueCommentIds = [...new Set(commentIds)];

    const [conversations, messages] = await Promise.all([
      uniqueThreadIds.length
        ? this.prisma.socialConversation.findMany({
            select: { externalConversationId: true },
            where: {
              externalConversationId: { in: uniqueThreadIds },
              isDeleted: false,
              organizationId,
              platform: 'youtube',
            },
          })
        : Promise.resolve([]),
      uniqueCommentIds.length
        ? this.prisma.socialMessage.findMany({
            select: { externalMessageId: true },
            where: {
              externalMessageId: { in: uniqueCommentIds },
              isDeleted: false,
              organizationId,
              platform: 'youtube',
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      conversationIds: new Set(
        conversations
          .map((row) => row.externalConversationId)
          .filter((id): id is string => Boolean(id)),
      ),
      messageIds: new Set(
        messages
          .map((row) => row.externalMessageId)
          .filter((id): id is string => Boolean(id)),
      ),
    };
  }

  private async findYoutubeCredentials(
    scope: SocialInboxScope,
    credentialId?: string,
  ) {
    return this.prisma.credential.findMany({
      where: {
        ...(credentialId ? { id: credentialId } : {}),
        ...(scope.brandId ? { brandId: scope.brandId } : {}),
        isConnected: true,
        isDeleted: false,
        organizationId: scope.organizationId,
        platform: PrismaCredentialPlatform.YOUTUBE,
      },
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
      where: {
        externalConversationId: input.externalConversationId,
        isDeleted: false,
        organizationId: input.organizationId,
        platform: input.platform,
      },
    });

    if (existing) {
      return this.toConversationDocument(existing);
    }

    let created: Awaited<
      ReturnType<typeof this.prisma.socialConversation.create>
    >;
    try {
      created = await this.prisma.socialConversation.create({
        data: {
          accountExternalId: this.clamp(input.accountExternalId, 512),
          accountHandle: this.clamp(input.accountHandle, 280),
          accountName: this.clamp(input.accountName, 280),
          availability: input.availability as unknown as Prisma.InputJsonValue,
          automationState: 'manual',
          brandId: input.brandId,
          conversationType: input.conversationType,
          credentialId: input.credentialId,
          externalConversationId: input.externalConversationId,
          externalParentId: this.clamp(input.externalParentId, 512),
          externalThreadId: this.clamp(input.externalThreadId, 512),
          lastInboundAt: input.createdAt,
          latestMessageAt: input.createdAt,
          latestMessageText: this.clamp(input.body, 500),
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          organizationId: input.organizationId,
          participantAvatarUrl: this.clamp(input.participantAvatarUrl, 2048),
          participantExternalId: this.clamp(input.participantExternalId, 512),
          participantHandle: this.clamp(input.participantHandle, 280),
          participantName: this.clamp(input.participantName, 280),
          platform: input.platform,
          postId: input.postId,
          sourceContentId: this.clamp(input.sourceContentId, 512),
          sourceContentTitle: this.clamp(input.sourceContentTitle, 500),
          sourceContentType: this.clamp(input.sourceContentType, 100),
          sourceContentUrl: this.clamp(input.sourceContentUrl, 2048),
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
        where: {
          externalConversationId: input.externalConversationId,
          isDeleted: false,
          organizationId: input.organizationId,
          platform: input.platform,
        },
      });
      if (!winner) {
        throw error;
      }
      return this.toConversationDocument(winner);
    }

    return this.toConversationDocument(created);
  }

  private async publishReply(
    conversation: SocialConversationDocument,
    text: string,
  ): Promise<{ messageId: string; url?: string }> {
    if (!conversation.brandId) {
      throw new BadRequestException('A brand is required to publish replies');
    }

    if (conversation.platform === 'youtube') {
      const parentCommentId = conversation.externalParentId;
      if (!parentCommentId) {
        throw new BadRequestException(
          'YouTube reply requires a parent comment id',
        );
      }

      const result = await this.youtubeService.postCommentReply(
        conversation.organizationId,
        conversation.brandId,
        parentCommentId,
        text,
      );

      return {
        messageId: result.commentId,
        url: conversation.sourceContentUrl ?? undefined,
      };
    }

    if (conversation.platform === 'instagram') {
      const parentCommentId =
        conversation.externalParentId ?? conversation.externalConversationId;
      if (!parentCommentId) {
        throw new BadRequestException('Instagram reply requires a comment id');
      }

      const result = await this.instagramService.replyToComment(
        conversation.organizationId,
        conversation.brandId,
        parentCommentId,
        text,
      );

      return {
        messageId: result.commentId,
        url: conversation.sourceContentUrl ?? undefined,
      };
    }

    throw new BadRequestException(
      `${conversation.platform} replies are not supported`,
    );
  }

  private async queueCommentTrigger(
    input: InboundSocialMessageInput,
    message: SocialMessage,
    conversation: SocialConversationDocument,
  ): Promise<void> {
    const userId = input.userId ?? message.userId ?? undefined;
    if (!this.workflowExecutionQueueService || !userId) {
      return;
    }

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
      where: {
        conversationId: conversation.id,
        id: message.id,
        isDeleted: false,
        organizationId: input.organizationId,
        OR: [
          { workflowTriggerStatus: null },
          { workflowTriggerStatus: { in: ['pending', 'failed'] } },
          {
            workflowTriggerAttemptedAt: { lt: staleClaimBefore },
            workflowTriggerStatus: 'enqueueing',
          },
        ],
      },
    });

    if (claim.count === 0) {
      return;
    }

    const triggerData = {
      authorId: input.participantExternalId,
      authorUsername: input.participantHandle ?? input.participantName,
      brandId: input.brandId,
      commentId: input.externalMessageId,
      conversationId: conversation.id,
      contentId: input.sourceContentId,
      contentUrl: input.sourceContentUrl,
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
    };

    let queuedJobId: string;
    try {
      queuedJobId = await this.workflowExecutionQueueService.queueTriggerEvent(
        {
          data: triggerData,
          organizationId: input.organizationId,
          platform: conversation.platform,
          type: 'commentTrigger',
          userId,
        },
        { jobId },
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.prisma.$transaction(async (transaction) => {
        const finalized = await transaction.socialMessage.updateMany({
          data: {
            workflowTriggerError: errorMessage,
            workflowTriggerStatus: 'failed',
          },
          where: {
            conversationId: conversation.id,
            id: message.id,
            isDeleted: false,
            organizationId: input.organizationId,
            workflowTriggerAttemptedAt: attemptedAt,
            workflowTriggerStatus: 'enqueueing',
          },
        });
        if (finalized.count === 0) {
          return;
        }

        // Reload the conversation inside the transaction — the row captured
        // before the async queueTriggerEvent() call may be stale, and
        // merging from that snapshot risks clobbering a concurrent
        // conversation update.
        const freshConversation =
          await transaction.socialConversation.findFirst({
            where: {
              id: conversation.id,
              isDeleted: false,
              organizationId: input.organizationId,
            },
          });
        if (!freshConversation) {
          return;
        }

        // updateMany (not update) so a conversation that no longer matches
        // the scope filter is a no-op instead of throwing P2025 and
        // aborting ingestion after the message row was already finalized.
        await transaction.socialConversation.updateMany({
          data: {
            automationState: 'failed',
            metadata: {
              ...this.asRecord(freshConversation.metadata),
              workflowTriggerError: errorMessage,
              workflowTriggerFailedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
          where: {
            id: conversation.id,
            isDeleted: false,
            organizationId: input.organizationId,
          },
        });
      });
      return;
    }

    const queuedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const finalized = await transaction.socialMessage.updateMany({
        data: {
          workflowTriggerError: null,
          workflowTriggerJobId: queuedJobId,
          workflowTriggerQueuedAt: queuedAt,
          workflowTriggerStatus: 'queued',
        },
        where: {
          conversationId: conversation.id,
          id: message.id,
          isDeleted: false,
          organizationId: input.organizationId,
          workflowTriggerAttemptedAt: attemptedAt,
          workflowTriggerStatus: 'enqueueing',
        },
      });
      if (finalized.count === 0) {
        return;
      }

      // Reload the conversation inside the transaction for the same reason
      // as the failure branch above: `conversation` was captured before the
      // async queueTriggerEvent() call, so deriving automationState/metadata
      // from it here could overwrite a concurrent conversation update.
      const freshConversation = await transaction.socialConversation.findFirst({
        where: {
          id: conversation.id,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
      if (!freshConversation) {
        return;
      }
      const freshMetadata = this.asRecord(freshConversation.metadata);

      // updateMany (not update) so a conversation that no longer matches the
      // scope filter is a no-op instead of throwing P2025 and aborting
      // ingestion after the job was already queued and the message finalized.
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
        where: {
          id: conversation.id,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
    });
  }

  private async publishDm(
    conversation: SocialConversationDocument,
    input: { recipientId?: string; text: string },
  ): Promise<{ messageId: string }> {
    if (!conversation.brandId) {
      throw new BadRequestException('A brand is required to send DMs');
    }

    if (conversation.platform !== 'instagram') {
      throw new BadRequestException(
        `${conversation.platform} DMs are not supported`,
      );
    }

    const recipientId = input.recipientId ?? conversation.participantExternalId;
    if (!recipientId) {
      throw new BadRequestException('Instagram DM requires a recipient id');
    }

    const messageId = await this.instagramService.sendCommentReplyDm(
      conversation.organizationId,
      conversation.brandId,
      recipientId,
      input.text,
    );

    return { messageId: messageId ?? `instagram_dm_${Date.now()}` };
  }

  private getAvailability(params: {
    platform: string;
    conversationType?: string | null;
    sourceContentId?: string | null;
    externalParentId?: string | null;
    participantExternalId?: string | null;
  }): SocialConversationAvailability {
    if (!SUPPORTED_PLATFORMS.has(params.platform)) {
      return {
        canPostReply: false,
        canSendDm: false,
        postReplyReason: `${params.platform} reply support is not implemented`,
        sendDmReason: `${params.platform} DM support is not implemented`,
      };
    }

    if (params.platform === 'youtube') {
      return {
        canPostReply: Boolean(params.externalParentId),
        canSendDm: false,
        postReplyReason: params.externalParentId
          ? undefined
          : 'YouTube reply requires a parent comment id',
        sendDmReason: 'YouTube Data API does not support channel DMs',
      };
    }

    if (params.platform === 'instagram') {
      return {
        canPostReply: Boolean(params.externalParentId),
        canSendDm: Boolean(params.participantExternalId),
        postReplyReason: params.externalParentId
          ? undefined
          : 'Instagram reply requires a comment id',
        sendDmReason: params.participantExternalId
          ? undefined
          : 'Instagram DM requires the commenter recipient id',
      };
    }

    return {
      canPostReply: false,
      canSendDm: false,
      postReplyReason: 'Unsupported platform',
      sendDmReason: 'Unsupported platform',
    };
  }

  private readAvailability(
    conversation: SocialConversationDocument,
  ): SocialConversationAvailability {
    const stored = this.asRecord(conversation.availability);
    return {
      canPostReply:
        typeof stored.canPostReply === 'boolean'
          ? stored.canPostReply
          : this.getAvailability(conversation).canPostReply,
      canSendDm:
        typeof stored.canSendDm === 'boolean'
          ? stored.canSendDm
          : this.getAvailability(conversation).canSendDm,
      postReplyReason:
        typeof stored.postReplyReason === 'string'
          ? stored.postReplyReason
          : undefined,
      sendDmReason:
        typeof stored.sendDmReason === 'string'
          ? stored.sendDmReason
          : undefined,
    };
  }

  private buildConversationIdentityWhere(
    scope: SocialInboxScope,
    conversationId: string,
  ): Prisma.SocialConversationWhereInput {
    return {
      id: conversationId,
      isDeleted: false,
      organizationId: scope.organizationId,
      ...(scope.brandId
        ? { OR: [{ brandId: scope.brandId }, { brandId: null }] }
        : {}),
    };
  }

  private buildConversationWhere(
    scope: SocialInboxScope,
    query: SocialInboxListQuery,
  ): Prisma.SocialConversationWhereInput {
    const where: Prisma.SocialConversationWhereInput = {
      isDeleted: false,
      organizationId: scope.organizationId,
      ...(scope.brandId
        ? { OR: [{ brandId: scope.brandId }, { brandId: null }] }
        : {}),
    };

    if (query.platform) where.platform = query.platform;
    if (query.status) where.status = query.status;
    if (query.automationState) where.automationState = query.automationState;
    if (query.conversationType) where.conversationType = query.conversationType;
    if (query.credentialId) where.credentialId = query.credentialId;
    if (query.assignedOwnerId) where.assignedOwnerId = query.assignedOwnerId;
    if (query.tag) where.tags = { has: query.tag };
    if (query.unread) where.unreadCount = { gt: 0 };
    if (typeof query.needsReview === 'boolean') {
      where.needsReview = query.needsReview;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      const searchClauses: Prisma.SocialConversationWhereInput[] = [
        { participantName: { contains: search, mode: 'insensitive' } },
        { participantHandle: { contains: search, mode: 'insensitive' } },
        { latestMessageText: { contains: search, mode: 'insensitive' } },
        { sourceContentTitle: { contains: search, mode: 'insensitive' } },
      ];

      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { OR: searchClauses },
      ];
    }

    return where;
  }

  private async executeOutboundAction(
    action: OutboundAction,
    messageType: OutboundMessageType,
    conversation: SocialConversationDocument,
    scope: SocialInboxScope,
    input: SocialActionInput,
    body: string,
    publish: () => Promise<OutboundPublishResult>,
  ): Promise<SocialMessageDocument> {
    const reservation = await this.reserveOutboundAction(
      action,
      messageType,
      conversation,
      scope,
      input,
      body,
    );

    if (!reservation.isClaimed) {
      return reservation.message;
    }

    let external: OutboundPublishResult;
    try {
      external = await publish();
    } catch (error: unknown) {
      await this.failOutboundAction(
        reservation.message.id,
        action,
        conversation,
        scope,
        input,
        error,
      );
      throw error;
    }

    const now = new Date();
    const finalized = await this.prisma.socialMessage.updateMany({
      data: {
        actionProvenance: this.buildActionProvenance({
          action,
          conversation,
          input,
          scope,
          status: 'sent',
        }) as Prisma.InputJsonValue,
        externalMessageId: external.messageId,
        failureReason: null,
        sourceUrl: external.url,
        status: 'sent',
      },
      where: {
        conversationId: conversation.id,
        id: reservation.message.id,
        isDeleted: false,
        organizationId: scope.organizationId,
        status: 'pending',
      },
    });

    if (finalized.count !== 1) {
      throw new ConflictException('Social action reservation was lost');
    }

    await this.prisma.socialConversation.update({
      data: {
        automationState:
          input.workflowRunId || input.agentRunId ? 'automated' : 'manual',
        latestMessageAt: now,
        latestMessageText: this.clamp(body, 500),
        lastOutboundAt: now,
        needsReview: false,
        status: 'open',
        unreadCount: 0,
        updatedAt: now,
      },
      where: {
        id: conversation.id,
        organizationId: scope.organizationId,
      },
    });

    const message = await this.prisma.socialMessage.findFirst({
      where: {
        conversationId: conversation.id,
        id: reservation.message.id,
        isDeleted: false,
        organizationId: scope.organizationId,
      },
    });
    if (!message) {
      throw new ConflictException('Finalized social action was not found');
    }

    return this.toMessageDocument(message);
  }

  private async reserveOutboundAction(
    action: OutboundAction,
    messageType: OutboundMessageType,
    conversation: SocialConversationDocument,
    scope: SocialInboxScope,
    input: SocialActionInput,
    body: string,
  ): Promise<OutboundReservation> {
    if (input.idempotencyKey) {
      const existing = await this.prisma.socialMessage.findFirst({
        where: {
          idempotencyKey: input.idempotencyKey,
          isDeleted: false,
          organizationId: scope.organizationId,
        },
      });
      if (existing) {
        return await this.claimExistingOutboundAction(
          existing,
          action,
          messageType,
          conversation,
          scope,
          input,
          body,
        );
      }
    }

    try {
      const created = await this.prisma.socialMessage.create({
        data: {
          actionProvenance: this.buildActionProvenance({
            action,
            conversation,
            input,
            scope,
            status: 'pending',
          }) as Prisma.InputJsonValue,
          agentRunId: input.agentRunId,
          body,
          brandId: conversation.brandId,
          conversationId: conversation.id,
          credentialId: conversation.credentialId,
          direction: 'outbound',
          externalParentMessageId:
            messageType === 'reply' ? conversation.externalParentId : undefined,
          idempotencyKey: input.idempotencyKey,
          messageType,
          organizationId: conversation.organizationId,
          platform: conversation.platform,
          postId: conversation.postId,
          status: 'pending',
          userId: scope.userId,
          workflowRunId: input.workflowRunId,
        },
      });

      return { isClaimed: true, message: this.toMessageDocument(created) };
    } catch (error: unknown) {
      if (
        !input.idempotencyKey ||
        (error as { code?: string })?.code !== 'P2002'
      ) {
        throw error;
      }

      const winner = await this.prisma.socialMessage.findFirst({
        where: {
          idempotencyKey: input.idempotencyKey,
          isDeleted: false,
          organizationId: scope.organizationId,
        },
      });
      if (!winner) {
        throw error;
      }

      return await this.claimExistingOutboundAction(
        winner,
        action,
        messageType,
        conversation,
        scope,
        input,
        body,
      );
    }
  }

  private async claimExistingOutboundAction(
    existing: SocialMessage,
    action: OutboundAction,
    messageType: OutboundMessageType,
    conversation: SocialConversationDocument,
    scope: SocialInboxScope,
    input: SocialActionInput,
    body: string,
  ): Promise<OutboundReservation> {
    if (
      existing.conversationId !== conversation.id ||
      existing.messageType !== messageType ||
      existing.body !== body
    ) {
      throw new BadRequestException(
        'Idempotency key is already used by another social action',
      );
    }

    if (existing.status === 'sent') {
      return {
        isClaimed: false,
        message: this.toMessageDocument(existing),
      };
    }

    if (existing.status === 'pending') {
      throw new ConflictException('Social action is already in progress');
    }

    if (existing.status !== 'failed') {
      throw new ConflictException(
        `Social action cannot be retried from status ${existing.status}`,
      );
    }

    const claimed = await this.prisma.socialMessage.updateMany({
      data: {
        actionProvenance: this.buildActionProvenance({
          action,
          conversation,
          input,
          scope,
          status: 'pending',
        }) as Prisma.InputJsonValue,
        failureReason: null,
        status: 'pending',
      },
      where: {
        conversationId: conversation.id,
        id: existing.id,
        isDeleted: false,
        organizationId: scope.organizationId,
        status: 'failed',
      },
    });

    if (claimed.count !== 1) {
      const current = await this.prisma.socialMessage.findFirst({
        where: {
          conversationId: conversation.id,
          id: existing.id,
          isDeleted: false,
          organizationId: scope.organizationId,
        },
      });
      if (current?.status === 'sent') {
        return {
          isClaimed: false,
          message: this.toMessageDocument(current),
        };
      }
      throw new ConflictException('Social action retry is already in progress');
    }

    const reservation = await this.prisma.socialMessage.findFirst({
      where: {
        conversationId: conversation.id,
        id: existing.id,
        isDeleted: false,
        organizationId: scope.organizationId,
        status: 'pending',
      },
    });
    if (!reservation) {
      throw new ConflictException('Social action reservation was not found');
    }

    return {
      isClaimed: true,
      message: this.toMessageDocument(reservation),
    };
  }

  private async failOutboundAction(
    messageId: string,
    action: OutboundAction,
    conversation: SocialConversationDocument,
    scope: SocialInboxScope,
    input: SocialActionInput,
    error: unknown,
  ): Promise<void> {
    const reason = this.clamp(
      error instanceof Error ? error.message : String(error),
      1000,
    );

    await this.prisma.socialMessage.updateMany({
      data: {
        actionProvenance: this.buildActionProvenance({
          action,
          conversation,
          input,
          scope,
          status: 'failed',
        }) as Prisma.InputJsonValue,
        failureReason: reason ?? 'Provider publish failed',
        status: 'failed',
      },
      where: {
        conversationId: conversation.id,
        id: messageId,
        isDeleted: false,
        organizationId: scope.organizationId,
        status: 'pending',
      },
    });
  }

  private async getDraftMessage(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
  ): Promise<SocialMessageDocument> {
    await this.getConversation(scope, conversationId);

    const draft = await findOrThrow(
      this.prisma.socialMessage,
      {
        where: {
          conversationId,
          id: messageId,
          isDeleted: false,
          organizationId: scope.organizationId,
          status: 'draft',
        },
      },
      'Draft message',
    );

    return this.toMessageDocument(draft);
  }

  private buildActionProvenance({
    action,
    conversation,
    input,
    scope,
    status,
  }: {
    action: string;
    conversation: SocialConversationDocument;
    input: SocialActionInput;
    scope: SocialInboxScope;
    status: string;
  }): JsonRecord {
    const actorType = input.agentRunId
      ? 'agent'
      : input.workflowRunId
        ? 'workflow'
        : scope.userId
          ? 'user'
          : 'system';

    return {
      action,
      agentRunId: input.agentRunId,
      actedAt: new Date().toISOString(),
      actorType,
      platform: conversation.platform,
      status,
      userId: scope.userId,
      workflowRunId: input.workflowRunId,
    };
  }

  private normalizePlatform(platform: string): string {
    return platform.trim().toLowerCase();
  }

  private sanitizeBody(body: string): string {
    const stripped = body
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!stripped) {
      throw new BadRequestException('Message body cannot be empty');
    }

    return stripped.slice(0, 10_000);
  }

  private clamp(
    value: string | null | undefined,
    max: number,
  ): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.slice(0, max);
  }

  private asRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  }

  private boundPage(page = 1): number {
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  }

  private boundLimit(limit = DEFAULT_PAGE_SIZE): number {
    if (!Number.isFinite(limit)) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.min(Math.max(Math.floor(limit), 1), MAX_PAGE_SIZE);
  }

  private page<T>(
    docs: T[],
    totalDocs: number,
    page: number,
    limit: number,
  ): SocialInboxPage<T> {
    const totalPages = Math.max(Math.ceil(totalDocs / limit), 1);
    return {
      docs,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit,
      page,
      pages: totalPages,
      total: totalDocs,
      totalDocs,
      totalPages,
    };
  }

  private toConversationDocument(
    conversation: SocialConversation,
  ): SocialConversationDocument {
    return {
      ...conversation,
      _id: conversation.id,
      brand: conversation.brandId,
      credential: conversation.credentialId,
      organization: conversation.organizationId,
      post: conversation.postId,
      user: conversation.userId,
    };
  }

  private toMessageDocument(message: SocialMessage): SocialMessageDocument {
    return {
      ...message,
      _id: message.id,
      brand: message.brandId,
      conversation: message.conversationId,
      credential: message.credentialId,
      organization: message.organizationId,
      post: message.postId,
      user: message.userId,
    };
  }
}
