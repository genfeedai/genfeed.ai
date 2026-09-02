import type {
  SocialConversationDocument,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import {
  boundLimit,
  boundPage,
  toPage,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  SocialInboxListQuery,
  SocialInboxPage,
  SocialInboxScope,
} from '@api/collections/social-inbox/services/social-inbox.types';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { SocialMessageDirection, SocialMessageType } from '@genfeedai/enums';
import type {
  SocialInboxAgentContextRecord,
  SocialInboxAgentMessageContext,
  SocialInboxReference,
} from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

const MAX_AGENT_CONTEXT_REFERENCES = 20;
const SAFE_AGENT_CONTEXT_REFERENCE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SOCIAL_MESSAGE_DIRECTIONS = new Set<string>(
  Object.values(SocialMessageDirection),
);
const SOCIAL_MESSAGE_TYPES = new Set<string>(Object.values(SocialMessageType));

function isSocialMessageDirection(
  value: string,
): value is SocialInboxAgentMessageContext['direction'] {
  return SOCIAL_MESSAGE_DIRECTIONS.has(value);
}

function isSocialMessageType(
  value: string,
): value is SocialInboxAgentMessageContext['messageType'] {
  return SOCIAL_MESSAGE_TYPES.has(value);
}

function toAgentMessageContext(
  message: SocialMessageDocument,
): SocialInboxAgentMessageContext {
  if (
    !isSocialMessageDirection(message.direction) ||
    !isSocialMessageType(message.messageType)
  ) {
    throw new BadRequestException('Unsupported social message state');
  }

  return {
    body: message.body,
    direction: message.direction,
    messageId: message.id,
    messageType: message.messageType,
  };
}

@Injectable()
export class SocialInboxQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(
    scope: SocialInboxScope,
    query: SocialInboxListQuery,
  ): Promise<SocialInboxPage<SocialConversationDocument>> {
    const page = boundPage(query.page);
    const limit = boundLimit(query.limit);
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

    return toPage(docs, totalDocs, page, limit);
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

    return conversation;
  }

  async listMessages(
    scope: SocialInboxScope,
    conversationId: string,
    options: { cursor?: string; limit?: number; page?: number } = {},
  ): Promise<SocialInboxPage<SocialMessageDocument>> {
    await this.getConversation(scope, conversationId);

    const limit = boundLimit(options.limit ?? 50);
    const page = boundPage(options.page);
    const where: Prisma.SocialMessageWhereInput = scopedWhere(
      scope.organizationId,
      { conversationId },
    );

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

    return toPage(docs.reverse(), totalDocs, page, limit);
  }

  async authorizeAgentContextReferences(
    scope: SocialInboxScope,
    references: readonly SocialInboxReference[],
  ): Promise<SocialInboxReference[]> {
    const resolved = await this.resolveAgentContextReferences(
      scope,
      references,
    );
    return resolved.references;
  }

  async resolveAgentContextReferences(
    scope: SocialInboxScope,
    references: readonly SocialInboxReference[],
  ): Promise<{
    context: SocialInboxAgentContextRecord[];
    references: SocialInboxReference[];
  }> {
    const boundedReferences = references.slice(0, MAX_AGENT_CONTEXT_REFERENCES);
    const uniqueReferences = new Map<string, SocialInboxReference>();

    for (const reference of boundedReferences) {
      if (
        (reference.kind !== 'social-conversation' &&
          reference.kind !== 'social-message') ||
        typeof reference.conversationId !== 'string' ||
        !SAFE_AGENT_CONTEXT_REFERENCE_ID.test(reference.conversationId) ||
        (reference.kind === 'social-message' &&
          (typeof reference.messageId !== 'string' ||
            !SAFE_AGENT_CONTEXT_REFERENCE_ID.test(reference.messageId)))
      ) {
        throw new BadRequestException('Invalid social inbox reference');
      }

      const key =
        reference.kind === 'social-message'
          ? `${reference.kind}:${reference.conversationId}:${reference.messageId}`
          : `${reference.kind}:${reference.conversationId}`;
      uniqueReferences.set(key, reference);
    }

    const authorized: SocialInboxReference[] = [];
    const context: SocialInboxAgentContextRecord[] = [];
    for (const reference of uniqueReferences.values()) {
      const conversation = await this.getConversation(
        scope,
        reference.conversationId,
      );

      if (reference.kind === 'social-message') {
        const message = await findOrThrow(
          this.prisma.socialMessage,
          {
            where: scopedWhere(conversation.organizationId, {
              conversationId: conversation.id,
              id: reference.messageId,
            }),
          },
          'Social message',
        );
        authorized.push({
          ...(conversation.brandId ? { brandId: conversation.brandId } : {}),
          conversationId: conversation.id,
          kind: 'social-message',
          messageId: reference.messageId,
          organizationId: conversation.organizationId,
        });
        const messageDocument = message;
        context.push({
          conversationId: conversation.id,
          kind: 'social-message',
          messageId: messageDocument.id,
          messages: [toAgentMessageContext(messageDocument)],
        });
        continue;
      }

      authorized.push({
        ...(conversation.brandId ? { brandId: conversation.brandId } : {}),
        conversationId: conversation.id,
        kind: 'social-conversation',
        organizationId: conversation.organizationId,
      });
      const recentMessages = await this.listMessages(scope, conversation.id, {
        limit: 20,
      });
      context.push({
        conversationId: conversation.id,
        kind: 'social-conversation',
        messages: recentMessages.docs.map(toAgentMessageContext),
      });
    }

    return { context, references: authorized };
  }

  private buildConversationIdentityWhere(
    scope: SocialInboxScope,
    conversationId: string,
  ): Prisma.SocialConversationWhereInput {
    // Org membership is the tenancy boundary. Brand is a list filter, not a
    // hard ACL on conversation identity — org-scoped Messages needs to open
    // conversations from any brand in the organization.
    return scopedWhere(scope.organizationId, {
      id: conversationId,
    });
  }

  private resolveListBrandId(
    scope: SocialInboxScope,
    query: SocialInboxListQuery,
  ): string | undefined {
    if (query.allBrands) {
      return undefined;
    }

    if (typeof query.brandId === 'string' && query.brandId.trim()) {
      return query.brandId.trim();
    }

    // Legacy: session brand still narrows when the client does not send brandId.
    return scope.brandId;
  }

  private buildConversationWhere(
    scope: SocialInboxScope,
    query: SocialInboxListQuery,
  ): Prisma.SocialConversationWhereInput {
    const brandId = this.resolveListBrandId(scope, query);
    const where: Prisma.SocialConversationWhereInput = scopedWhere(
      scope.organizationId,
      {
        ...(brandId ? { OR: [{ brandId }, { brandId: null }] } : {}),
      },
    );

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
}
