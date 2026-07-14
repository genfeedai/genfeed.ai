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
  normalizePlatform,
  sanitizeBody,
  toConversationDocument,
  toMessageDocument,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  InboundSocialMessageInput,
  SocialInboxScope,
} from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PostStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { Injectable, Optional } from '@nestjs/common';

const WORKFLOW_TRIGGER_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

type WorkflowTriggerClaim = {
  attemptedAt: Date;
  jobId: string;
};

@Injectable()
export class SocialInboxIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService,
    private readonly realtimeService: SocialInboxRealtimeService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
  ) {}

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
      where: {
        externalMessageId: input.externalMessageId,
        isDeleted: false,
        organizationId: input.organizationId,
        platform,
      },
    });

    if (existing) {
      await this.queueCommentTrigger(input, existing, conversation);
      return toMessageDocument(existing);
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
      return toMessageDocument(winner);
    }

    await this.prisma.socialConversation.update({
      data: {
        latestMessageAt: messageCreatedAt,
        latestMessageText: clamp(body, 500),
        lastInboundAt: messageCreatedAt,
        unreadCount: { increment: 1 },
        updatedAt: new Date(),
      },
      where: { id: conversation.id },
    });

    await this.queueCommentTrigger(input, message, conversation);

    await this.realtimeService.emit(
      input.organizationId,
      conversation.id,
      'message-created',
    );

    return toMessageDocument(message);
  }

  async ingestYoutubeComments(
    scope: SocialInboxScope,
    options: { credentialId?: string; limit?: number } = {},
  ): Promise<{ conversationsCreated: number; messagesCreated: number }> {
    const limit = boundLimit(options.limit ?? 25);
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
      return toConversationDocument(existing);
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
      return toConversationDocument(winner);
    }

    return toConversationDocument(created);
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

      await transaction.socialConversation.updateMany({
        data: {
          automationState: 'failed',
          metadata: {
            ...asRecord(freshConversation.metadata),
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
        where: {
          id: conversation.id,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
    });
  }
}
