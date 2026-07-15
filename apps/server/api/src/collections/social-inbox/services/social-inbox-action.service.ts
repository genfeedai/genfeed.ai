import type {
  SocialConversationDocument,
  SocialMessage,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import {
  asRecord,
  clamp,
  readAvailability,
  sanitizeBody,
  toConversationDocument,
  toMessageDocument,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  OutboundAction,
  OutboundMessageType,
  OutboundPublishResult,
  OutboundReservation,
  SocialActionInput,
  SocialConversationPatch,
  SocialInboxScope,
} from '@api/collections/social-inbox/services/social-inbox.types';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import type { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class SocialInboxActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService,
    private readonly instagramService: InstagramService,
    private readonly queryService: SocialInboxQueryService,
    private readonly realtimeService: SocialInboxRealtimeService,
  ) {}

  async createDraft(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const conversation = await this.queryService.getConversation(
      scope,
      conversationId,
    );
    const body = sanitizeBody(input.text);
    const existing = await this.findIdempotentDraft(
      scope,
      conversation,
      input,
      body,
    );
    if (existing) {
      return existing;
    }

    let message: Awaited<ReturnType<typeof this.prisma.socialMessage.create>>;
    try {
      message = await this.prisma.socialMessage.create({
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
          idempotencyKey: input.idempotencyKey,
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
    } catch (error: unknown) {
      if (
        !input.idempotencyKey ||
        (error as { code?: string })?.code !== 'P2002'
      ) {
        throw error;
      }

      const winner = await this.findIdempotentDraft(
        scope,
        conversation,
        input,
        body,
      );
      if (!winner) {
        throw error;
      }
      return winner;
    }

    await this.prisma.socialConversation.update({
      data: {
        automationState: 'drafted',
        latestMessageAt: message.createdAt,
        latestMessageText: clamp(body, 500),
        needsReview: true,
        updatedAt: new Date(),
      },
      where: { id: conversation.id },
    });

    await this.realtimeService.emit(
      conversation.organizationId,
      conversation.id,
      'message-created',
    );

    return toMessageDocument(message);
  }

  async approveDraft(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
  ): Promise<SocialMessageDocument> {
    const draft = await this.getDraftMessage(scope, conversationId, messageId);
    const draftMetadata = asRecord(draft.metadata);
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
          ...asRecord(draft.actionProvenance),
          approvedAt: new Date().toISOString(),
          approvedBy: scope.userId,
          approvedMessageId: sent.id,
        } as Prisma.InputJsonValue,
        status: 'approved',
      },
      where: { id: draft.id },
    });

    await this.realtimeService.emit(
      draft.organizationId,
      conversationId,
      'message-updated',
    );

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
          ...asRecord(draft.actionProvenance),
          rejectedAt: new Date().toISOString(),
          rejectedBy: scope.userId,
        } as Prisma.InputJsonValue,
        failureReason: clamp(reason, 1000),
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

    await this.realtimeService.emit(
      draft.organizationId,
      conversationId,
      'message-updated',
    );

    return toMessageDocument(rejected);
  }

  async postReply(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const conversation = await this.queryService.getConversation(
      scope,
      conversationId,
    );
    const availability = readAvailability(conversation);
    if (!availability.canPostReply) {
      throw new BadRequestException(
        availability.postReplyReason ?? 'Reply is not available',
      );
    }

    const body = sanitizeBody(input.text);
    const message = await this.executeOutboundAction(
      'post_reply',
      'reply',
      conversation,
      scope,
      input,
      body,
      () => this.publishReply(conversation, body),
    );
    await this.realtimeService.emit(
      conversation.organizationId,
      conversation.id,
      'message-created',
    );
    return message;
  }

  async sendDm(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const conversation = await this.queryService.getConversation(
      scope,
      conversationId,
    );
    const availability = readAvailability(conversation);
    if (!availability.canSendDm) {
      throw new BadRequestException(
        availability.sendDmReason ?? 'DM is not available',
      );
    }

    const body = sanitizeBody(input.text);
    const message = await this.executeOutboundAction(
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
    await this.realtimeService.emit(
      conversation.organizationId,
      conversation.id,
      'message-created',
    );
    return message;
  }

  async updateConversation(
    scope: SocialInboxScope,
    conversationId: string,
    patch: SocialConversationPatch,
  ): Promise<SocialConversationDocument> {
    await this.queryService.getConversation(scope, conversationId);

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

    await this.realtimeService.emit(
      updated.organizationId,
      updated.id,
      'conversation-updated',
    );

    return toConversationDocument(updated);
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
        latestMessageText: clamp(body, 500),
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

    return toMessageDocument(message);
  }

  private async findIdempotentDraft(
    scope: SocialInboxScope,
    conversation: SocialConversationDocument,
    input: SocialActionInput,
    body: string,
  ): Promise<SocialMessageDocument | null> {
    if (!input.idempotencyKey) {
      return null;
    }

    const existing = await this.prisma.socialMessage.findFirst({
      where: {
        idempotencyKey: input.idempotencyKey,
        isDeleted: false,
        organizationId: scope.organizationId,
      },
    });
    if (!existing) {
      return null;
    }

    const expectedMessageType = input.messageType === 'dm' ? 'dm' : 'reply';
    if (
      existing.body !== body ||
      existing.conversationId !== conversation.id ||
      existing.direction !== 'outbound' ||
      existing.messageType !== expectedMessageType ||
      existing.status !== 'draft'
    ) {
      throw new BadRequestException(
        'Idempotency key is already used by another social action',
      );
    }

    return toMessageDocument(existing);
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

      return { isClaimed: true, message: toMessageDocument(created) };
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
        message: toMessageDocument(existing),
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
          message: toMessageDocument(current),
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
      message: toMessageDocument(reservation),
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
    const reason = clamp(
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
    await this.queryService.getConversation(scope, conversationId);

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

    return toMessageDocument(draft);
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
}
