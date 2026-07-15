import type {
  SocialConversation,
  SocialConversationAvailability,
  SocialConversationDocument,
  SocialMessage,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import type { SocialInboxPage } from '@api/collections/social-inbox/services/social-inbox.types';
import { BadRequestException } from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

const SUPPORTED_PLATFORMS = new Set(['youtube', 'instagram']);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function normalizePlatform(platform: string): string {
  return platform.trim().toLowerCase();
}

export function sanitizeBody(body: string): string {
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

export function clamp(
  value: string | null | undefined,
  max: number,
): string | undefined {
  return value ? value.slice(0, max) : undefined;
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function boundPage(page = 1): number {
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function boundLimit(limit = DEFAULT_PAGE_SIZE): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.max(Math.floor(limit), 1), MAX_PAGE_SIZE);
}

export function toPage<T>(
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

export function toConversationDocument(
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

export function toMessageDocument(
  message: SocialMessage,
): SocialMessageDocument {
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

export function getAvailability(params: {
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

export function readAvailability(
  conversation: SocialConversationDocument,
): SocialConversationAvailability {
  const stored = asRecord(conversation.availability);
  const derived = getAvailability(conversation);
  return {
    canPostReply:
      typeof stored.canPostReply === 'boolean'
        ? stored.canPostReply
        : derived.canPostReply,
    canSendDm:
      typeof stored.canSendDm === 'boolean'
        ? stored.canSendDm
        : derived.canSendDm,
    postReplyReason:
      typeof stored.postReplyReason === 'string'
        ? stored.postReplyReason
        : undefined,
    sendDmReason:
      typeof stored.sendDmReason === 'string' ? stored.sendDmReason : undefined,
  };
}
