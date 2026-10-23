import type { SocialConversationDocument } from '@api/collections/social-inbox/schemas/social-inbox.schema';
import type {
  OutboundAction,
  OutboundMessageType,
  SocialActionInput,
  SocialConversationPatch,
  SocialInboxScope,
} from '@api/collections/social-inbox/services/social-inbox.types';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

export type SocialInboxOutboundWorkflowState = {
  action: OutboundAction;
  body: string;
  conversationId: string;
  error?: string;
  errorKind?: 'bad-gateway' | 'bad-request' | 'conflict' | 'provider';
  externalMessageId?: string;
  externalParentMessageId?: string;
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

export function readOutboundState(
  input: Record<string, unknown>,
): SocialInboxOutboundWorkflowState {
  const state = readWorkflowRecord(input.state);
  const value =
    Object.keys(state).length > 0 ? state : readWorkflowRecord(input.request);
  if (value.outcome) {
    return value as SocialInboxOutboundWorkflowState;
  }
  const messageType = value.messageType === 'dm' ? 'dm' : 'reply';
  return {
    ...value,
    action: messageType === 'dm' ? 'send_dm' : 'post_reply',
    body: requireOutboundString(value.body, 'body'),
    conversationId: requireOutboundString(
      value.conversationId,
      'conversationId',
    ),
    messageType,
    organizationId: requireOutboundString(
      value.organizationId,
      'organizationId',
    ),
  } as SocialInboxOutboundWorkflowState;
}

export function toOutboundScope(
  state: SocialInboxOutboundWorkflowState,
): SocialInboxScope {
  return {
    organizationId: state.organizationId,
    userId: state.userId,
  };
}

export function toSocialActionInput(
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

function readWorkflowRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function requireOutboundString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Social inbox outbound action requires ${field}`);
  }
  return value;
}

export function buildActionProvenance({
  action,
  conversation,
  input,
  scope,
  status,
}: {
  action: string;
  conversation: Pick<SocialConversationDocument, 'platform'>;
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

export function buildConversationUpdate(patch: SocialConversationPatch) {
  const data: Prisma.SocialConversationUpdateInput = {};
  // Resolve/archive reads through this view; later replies stay unread.
  let isReadThrough = false;

  if (patch.status !== undefined) {
    data.status = patch.status;
    data.needsReview = patch.status === 'needs_review';
    isReadThrough = patch.status === 'resolved' || patch.status === 'archived';
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

  return { data, isReadThrough };
}
