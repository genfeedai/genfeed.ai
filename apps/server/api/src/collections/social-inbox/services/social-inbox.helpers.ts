import type {
  SocialConversationAvailability,
  SocialConversationDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import type { SocialInboxPage } from '@api/collections/social-inbox/services/social-inbox.types';
import {
  LINKEDIN_DM_NOT_IMPLEMENTED_REASON,
  LINKEDIN_DM_UNAVAILABLE_REASON,
} from '@api/services/integrations/linkedin/services/linkedin-inbox.constants';
import { replaceMarkup } from '@api/shared/utils/string/strip-markup.util';
import { Platform, SocialConversationType } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

const SUPPORTED_PLATFORMS = new Set([
  'instagram',
  'linkedin',
  'tiktok',
  'twitter',
  'youtube',
]);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// A DM thread is anchored to a participant, not to a piece of content, so the
// public reply action is structurally unavailable rather than merely missing an
// id. Surfacing the reason keeps the composer explainable instead of failing at
// action time.
const DM_POST_REPLY_REASON =
  'Direct message threads have no post or comment to reply on';
const TIKTOK_READ_ONLY_REASON = 'TikTok conversations are read-only in Genfeed';
const YOUTUBE_DM_REASON = 'YouTube Data API does not support channel DMs';

export { LINKEDIN_DM_NOT_IMPLEMENTED_REASON, LINKEDIN_DM_UNAVAILABLE_REASON };

export function normalizePlatform(platform: string): string {
  return platform.trim().toLowerCase();
}

export function sanitizeBody(body: string): string {
  const stripped = replaceMarkup(body, '', true).replace(/\s+/g, ' ').trim();

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

  const isDirectMessage = params.conversationType === SocialConversationType.DM;

  if (params.platform === Platform.TIKTOK) {
    return {
      canPostReply: false,
      canSendDm: false,
      postReplyReason: TIKTOK_READ_ONLY_REASON,
      sendDmReason: TIKTOK_READ_ONLY_REASON,
    };
  }

  if (params.platform === Platform.YOUTUBE) {
    if (isDirectMessage) {
      return {
        canPostReply: false,
        canSendDm: false,
        postReplyReason: DM_POST_REPLY_REASON,
        sendDmReason: YOUTUBE_DM_REASON,
      };
    }

    return {
      canPostReply: Boolean(params.externalParentId),
      canSendDm: false,
      postReplyReason: params.externalParentId
        ? undefined
        : 'YouTube reply requires a parent comment id',
      sendDmReason: YOUTUBE_DM_REASON,
    };
  }

  if (params.platform === Platform.LINKEDIN) {
    if (isDirectMessage) {
      return {
        canPostReply: false,
        canSendDm: false,
        postReplyReason: DM_POST_REPLY_REASON,
        sendDmReason: LINKEDIN_DM_UNAVAILABLE_REASON,
      };
    }

    return {
      canPostReply: Boolean(params.externalParentId),
      canSendDm: false,
      postReplyReason: params.externalParentId
        ? undefined
        : 'LinkedIn reply requires a comment id',
      sendDmReason: LINKEDIN_DM_UNAVAILABLE_REASON,
    };
  }

  if (params.platform === Platform.TWITTER) {
    if (isDirectMessage) {
      return {
        canPostReply: false,
        canSendDm: Boolean(params.participantExternalId),
        postReplyReason: DM_POST_REPLY_REASON,
        sendDmReason: params.participantExternalId
          ? undefined
          : 'X DM requires the participant recipient id',
      };
    }

    return {
      canPostReply: Boolean(params.externalParentId),
      canSendDm: Boolean(params.participantExternalId),
      postReplyReason: params.externalParentId
        ? undefined
        : 'X reply requires a tweet id',
      sendDmReason: params.participantExternalId
        ? undefined
        : 'X DM requires the participant recipient id',
    };
  }

  if (isDirectMessage) {
    return {
      canPostReply: false,
      canSendDm: Boolean(params.participantExternalId),
      postReplyReason: DM_POST_REPLY_REASON,
      sendDmReason: params.participantExternalId
        ? undefined
        : 'Instagram DM requires the participant recipient id',
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

  // Read-only platform policy is authoritative. A stale/imported availability
  // JSON blob must never re-enable an outbound TikTok action.
  if (normalizePlatform(conversation.platform) === Platform.TIKTOK) {
    return derived;
  }

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
