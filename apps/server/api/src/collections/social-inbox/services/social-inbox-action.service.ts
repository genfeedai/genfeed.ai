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
import {
  buildSocialInboxOutboundWorkflowDefinition,
  SOCIAL_INBOX_OUTBOUND_ACTION_IDS,
} from '@api/collections/social-inbox/services/social-inbox-outbound-workflow-definition';
import { SocialInboxQueryService } from '@api/collections/social-inbox/services/social-inbox-query.service';
import { SocialInboxRealtimeService } from '@api/collections/social-inbox/services/social-inbox-realtime.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { Platform, WorkflowExecutionTrigger } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

export type SocialInboxOutboundWorkflowState = {
  action: OutboundAction;
  body: string;
  conversationId: string;
  error?: string;
  errorKind?: 'bad-request' | 'conflict' | 'provider';
  externalMessageId?: string;
  externalUrl?: string;
  idempotencyKey?: string;
  messageType: OutboundMessageType;
  organizationId: string;
  outboundMessageId?: string;
  recipientId?: string;
  reservationClaimed?: boolean;
  userId?: string;
  workflowRunId?: string;
  [key: string]: unknown;
};

@Injectable()
export class SocialInboxActionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService,
    private readonly instagramService: InstagramService,
    private readonly queryService: SocialInboxQueryService,
    private readonly realtimeService: SocialInboxRealtimeService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerWorkflow(
      buildSocialInboxOutboundWorkflowDefinition('reply'),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildSocialInboxOutboundWorkflowDefinition('dm'),
    );
    this.systemWorkflowRunner.registerAction(
      SOCIAL_INBOX_OUTBOUND_ACTION_IDS.RESERVE,
      (request) => this.reserveOutboundActionNode(request),
    );
    this.systemWorkflowRunner.registerAction(
      SOCIAL_INBOX_OUTBOUND_ACTION_IDS.PROVIDER,
      (request) => this.executeOutboundProviderAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      SOCIAL_INBOX_OUTBOUND_ACTION_IDS.FINALIZE,
      (request) => this.finalizeOutboundActionNode(request),
    );
  }

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

    return message;
  }

  async approveDraft(
    scope: SocialInboxScope,
    conversationId: string,
    messageId: string,
  ): Promise<SocialMessageDocument> {
    const draft = await this.getDraftMessage(scope, conversationId, messageId);
    const draftMetadata = asRecord(draft.metadata);
    const recipientId =
      typeof draftMetadata.draftRecipientId === 'string'
        ? draftMetadata.draftRecipientId
        : undefined;
    const input: SocialActionInput = {
      idempotencyKey: `draft:${draft.id}:approve`,
      ...(recipientId === undefined ? {} : { recipientId }),
      text: draft.body,
      ...(draft.workflowRunId ? { workflowRunId: draft.workflowRunId } : {}),
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

    return rejected;
  }

  async postReply(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    return this.runOutboundWorkflow('reply', scope, conversationId, input);
  }

  async sendDm(
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    return this.runOutboundWorkflow('dm', scope, conversationId, input);
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

    return updated;
  }

  private async runOutboundWorkflow(
    messageType: OutboundMessageType,
    scope: SocialInboxScope,
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageDocument> {
    const definition = buildSocialInboxOutboundWorkflowDefinition(messageType);
    const { result } =
      await this.systemWorkflowRunner.runWorkflow<SocialInboxOutboundWorkflowState>(
        {
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          inputValues: {
            request: {
              action: messageType === 'dm' ? 'send_dm' : 'post_reply',
              body: input.text,
              conversationId,
              ...(input.idempotencyKey
                ? { idempotencyKey: input.idempotencyKey }
                : {}),
              messageType,
              organizationId: scope.organizationId,
              ...(input.recipientId ? { recipientId: input.recipientId } : {}),
              ...(scope.userId ? { userId: scope.userId } : {}),
              ...(input.workflowRunId
                ? { workflowRunId: input.workflowRunId }
                : {}),
            },
          },
          organizationId: scope.organizationId,
          source: `SocialInboxActionService.${messageType === 'dm' ? 'sendDm' : 'postReply'}`,
          trigger: WorkflowExecutionTrigger.API,
          userId: scope.userId,
        },
      );

    if (result.error) {
      if (result.errorKind === 'bad-request') {
        throw new BadRequestException(result.error);
      }
      if (result.errorKind === 'conflict') {
        throw new ConflictException(result.error);
      }
      throw new Error(result.error);
    }
    const messageId = this.requiredString(
      result.outboundMessageId,
      'outboundMessageId',
    );
    return findOrThrow(
      this.prisma.socialMessage,
      {
        where: scopedWhere(scope.organizationId, {
          conversationId,
          id: messageId,
        }),
      },
      'Outbound social message',
    );
  }

  private async reserveOutboundActionNode(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialInboxOutboundWorkflowState> {
    const state = this.readOutboundState(action.input);
    if (state.outcome) return state;
    try {
      const conversation = await this.queryService.getConversation(
        this.toScope(state),
        state.conversationId,
      );
      const availability = readAvailability(conversation);
      if (state.messageType === 'dm' && !availability.canSendDm) {
        throw new BadRequestException(
          availability.sendDmReason ?? 'DM is not available',
        );
      }
      if (state.messageType === 'reply' && !availability.canPostReply) {
        throw new BadRequestException(
          availability.postReplyReason ?? 'Reply is not available',
        );
      }
      const workflowState = {
        ...state,
        body: sanitizeBody(state.body),
        workflowRunId: state.workflowRunId ?? action.provenance.executionId,
      };
      const reservation = await this.reserveOutboundAction(
        workflowState.action,
        workflowState.messageType,
        conversation,
        this.toScope(workflowState),
        this.toSocialActionInput(workflowState),
        workflowState.body,
      );
      return {
        ...workflowState,
        outboundMessageId: reservation.message.id,
        reservationClaimed: reservation.isClaimed,
      };
    } catch (error: unknown) {
      return {
        ...state,
        error: error instanceof Error ? error.message : 'Reservation failed',
        errorKind:
          error instanceof BadRequestException
            ? 'bad-request'
            : error instanceof ConflictException
              ? 'conflict'
              : 'provider',
      };
    }
  }

  private async executeOutboundProviderAction(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialInboxOutboundWorkflowState> {
    const state = this.readOutboundState(action.input);
    if (state.outcome || state.error || state.reservationClaimed === false) {
      return state;
    }
    try {
      const result =
        state.messageType === 'dm'
          ? await this.executeProviderDmAction(state)
          : await this.executeProviderReplyAction(state);
      return {
        ...state,
        externalMessageId: result.messageId,
        ...('url' in result && typeof result.url === 'string'
          ? { externalUrl: result.url }
          : {}),
      };
    } catch (error: unknown) {
      return {
        ...state,
        error:
          error instanceof Error ? error.message : 'Provider publish failed',
        errorKind:
          error instanceof BadRequestException ? 'bad-request' : 'provider',
      };
    }
  }

  private async finalizeOutboundActionNode(
    action: SystemWorkflowActionRequest,
  ): Promise<SocialInboxOutboundWorkflowState> {
    const state = this.readOutboundState(action.input);
    if (state.outcome) return state;
    if (!state.outboundMessageId) return state;
    const conversation = await this.queryService.getConversation(
      this.toScope(state),
      state.conversationId,
    );
    if (state.error) {
      await this.failOutboundAction(
        state.outboundMessageId,
        state.action,
        conversation,
        this.toScope(state),
        this.toSocialActionInput(state),
        state.error,
      );
      return state;
    }
    if (state.reservationClaimed !== false) {
      await this.completeOutboundAction(state, conversation);
      await this.realtimeService.emit(
        state.organizationId,
        state.conversationId,
        'message-created',
      );
    }
    return state;
  }

  private readOutboundState(
    input: Record<string, unknown>,
  ): SocialInboxOutboundWorkflowState {
    const state = this.readRecord(input.state);
    const value =
      Object.keys(state).length > 0 ? state : this.readRecord(input.request);
    if (value.outcome) {
      return value as SocialInboxOutboundWorkflowState;
    }
    const messageType = value.messageType === 'dm' ? 'dm' : 'reply';
    return {
      ...value,
      action: messageType === 'dm' ? 'send_dm' : 'post_reply',
      body: this.requiredString(value.body, 'body'),
      conversationId: this.requiredString(
        value.conversationId,
        'conversationId',
      ),
      messageType,
      organizationId: this.requiredString(
        value.organizationId,
        'organizationId',
      ),
    } as SocialInboxOutboundWorkflowState;
  }

  private toScope(state: SocialInboxOutboundWorkflowState): SocialInboxScope {
    return {
      organizationId: state.organizationId,
      userId: state.userId,
    };
  }

  private toSocialActionInput(
    state: SocialInboxOutboundWorkflowState,
  ): SocialActionInput {
    return {
      idempotencyKey: state.idempotencyKey,
      messageType: state.messageType,
      recipientId: state.recipientId,
      text: state.body,
      workflowRunId: state.workflowRunId,
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Social inbox outbound action requires ${field}`);
    }
    return value;
  }

  private async executeProviderReplyAction(
    input: SocialInboxOutboundWorkflowState,
  ): Promise<OutboundPublishResult> {
    const organizationId = input.organizationId;
    const conversation = await this.queryService.getConversation(
      { organizationId },
      input.conversationId,
    );
    const text = input.body;

    if (!conversation.brandId) {
      throw new BadRequestException('A brand is required to publish replies');
    }

    if (conversation.platform === Platform.YOUTUBE) {
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
        conversation.credentialId ?? undefined,
      );

      return {
        messageId: result.commentId,
        ...(conversation.sourceContentUrl
          ? { url: conversation.sourceContentUrl }
          : {}),
      };
    }

    if (conversation.platform === Platform.INSTAGRAM) {
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
        conversation.credentialId ?? undefined,
      );

      return {
        messageId: result.commentId,
        ...(conversation.sourceContentUrl
          ? { url: conversation.sourceContentUrl }
          : {}),
      };
    }

    throw new BadRequestException(
      `${conversation.platform} replies are not supported`,
    );
  }

  private async executeProviderDmAction(
    input: SocialInboxOutboundWorkflowState,
  ): Promise<{ messageId: string }> {
    const organizationId = input.organizationId;
    const conversation = await this.queryService.getConversation(
      { organizationId },
      input.conversationId,
    );

    if (!conversation.brandId) {
      throw new BadRequestException('A brand is required to send DMs');
    }

    if (conversation.platform !== 'instagram') {
      throw new BadRequestException(
        `${conversation.platform} DMs are not supported`,
      );
    }

    const recipientId =
      (typeof input.recipientId === 'string' ? input.recipientId : undefined) ??
      conversation.participantExternalId;
    if (!recipientId) {
      throw new BadRequestException('Instagram DM requires a recipient id');
    }

    const messageId = await this.instagramService.sendCommentReplyDm(
      conversation.organizationId,
      conversation.brandId,
      recipientId,
      input.body,
      conversation.credentialId ?? undefined,
    );

    return { messageId: messageId ?? `instagram_dm_${Date.now()}` };
  }

  private async completeOutboundAction(
    state: SocialInboxOutboundWorkflowState,
    conversation: SocialConversationDocument,
  ): Promise<string> {
    const now = new Date();
    const finalized = await this.prisma.socialMessage.updateMany({
      data: {
        actionProvenance: this.buildActionProvenance({
          action: state.action,
          conversation,
          input: this.toSocialActionInput(state),
          scope: this.toScope(state),
          status: 'sent',
        }) as Prisma.InputJsonValue,
        externalMessageId: state.externalMessageId,
        failureReason: null,
        sourceUrl: state.externalUrl,
        status: 'sent',
      },
      where: scopedWhere(state.organizationId, {
        conversationId: conversation.id,
        id: state.outboundMessageId,
        status: 'pending',
      }),
    });

    if (finalized.count !== 1) {
      throw new ConflictException('Social action reservation was lost');
    }

    await this.prisma.socialConversation.update({
      data: {
        automationState: state.workflowRunId ? 'automated' : 'manual',
        latestMessageAt: now,
        latestMessageText: clamp(state.body, 500),
        lastOutboundAt: now,
        needsReview: false,
        status: 'open',
        unreadCount: 0,
        updatedAt: now,
      },
      where: {
        id: conversation.id,
        organizationId: state.organizationId,
      },
    });

    return this.requiredString(state.outboundMessageId, 'outboundMessageId');
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
      where: scopedWhere(scope.organizationId, {
        idempotencyKey: input.idempotencyKey,
      }),
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

    return existing;
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
        where: scopedWhere(scope.organizationId, {
          idempotencyKey: input.idempotencyKey,
        }),
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

      return { isClaimed: true, message: created };
    } catch (error: unknown) {
      if (
        !input.idempotencyKey ||
        (error as { code?: string })?.code !== 'P2002'
      ) {
        throw error;
      }

      const winner = await this.prisma.socialMessage.findFirst({
        where: scopedWhere(scope.organizationId, {
          idempotencyKey: input.idempotencyKey,
        }),
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
        message: existing,
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
      where: scopedWhere(scope.organizationId, {
        conversationId: conversation.id,
        id: existing.id,
        status: 'failed',
      }),
    });

    if (claimed.count !== 1) {
      const current = await this.prisma.socialMessage.findFirst({
        where: scopedWhere(scope.organizationId, {
          conversationId: conversation.id,
          id: existing.id,
        }),
      });
      if (current?.status === 'sent') {
        return {
          isClaimed: false,
          message: current,
        };
      }
      throw new ConflictException('Social action retry is already in progress');
    }

    const reservation = await this.prisma.socialMessage.findFirst({
      where: scopedWhere(scope.organizationId, {
        conversationId: conversation.id,
        id: existing.id,
        status: 'pending',
      }),
    });
    if (!reservation) {
      throw new ConflictException('Social action reservation was not found');
    }

    return {
      isClaimed: true,
      message: reservation,
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
      where: scopedWhere(scope.organizationId, {
        conversationId: conversation.id,
        id: messageId,
        status: 'pending',
      }),
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
        where: scopedWhere(scope.organizationId, {
          conversationId,
          id: messageId,
          status: 'draft',
        }),
      },
      'Draft message',
    );

    return draft;
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
    const actorType = input.workflowRunId
      ? 'workflow'
      : scope.userId
        ? 'user'
        : 'system';

    return {
      action,
      actedAt: new Date().toISOString(),
      actorType,
      platform: conversation.platform,
      status,
      userId: scope.userId,
      workflowRunId: input.workflowRunId,
    };
  }
}
