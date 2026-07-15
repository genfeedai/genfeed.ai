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

export type OutboundAction = 'post_reply' | 'send_dm';
export type OutboundMessageType = 'dm' | 'reply';
export type OutboundPublishResult = { messageId: string; url?: string };
export type OutboundReservation = {
  isClaimed: boolean;
  message: SocialMessageDocument;
};

import type { SocialMessageDocument } from '@api/collections/social-inbox/schemas/social-inbox.schema';
