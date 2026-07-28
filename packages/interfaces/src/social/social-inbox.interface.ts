import type {
  SocialActionActorType as SocialActionActorTypeEnum,
  SocialAutomationState as SocialAutomationStateEnum,
  SocialConversationStatus as SocialConversationStatusEnum,
  SocialConversationType as SocialConversationTypeEnum,
  SocialInboxPlatform,
  SocialMessageDirection as SocialMessageDirectionEnum,
  SocialMessageType as SocialMessageTypeEnum,
  SocialMessageWorkflowTriggerStatus,
} from '@genfeedai/enums';

export type SocialPlatform = `${SocialInboxPlatform}`;
export type SocialConversationStatus = `${SocialConversationStatusEnum}`;
export type SocialAutomationState = `${SocialAutomationStateEnum}`;
export type SocialConversationType = `${SocialConversationTypeEnum}`;
export type SocialMessageDirection = `${SocialMessageDirectionEnum}`;
export type SocialMessageType = `${SocialMessageTypeEnum}`;
export type SocialActionActorType = `${SocialActionActorTypeEnum}`;

export interface SocialActionProvenance {
  action?: string;
  actedAt?: string;
  actorType?: SocialActionActorType;
  agentRunId?: string | null;
  approvedAt?: string;
  approvedBy?: string | null;
  approvedMessageId?: string;
  platform?: SocialPlatform;
  rejectedAt?: string;
  rejectedBy?: string | null;
  status?: string;
  userId?: string | null;
  workflowRunId?: string | null;
}

export interface SocialConversationAvailability {
  canPostReply: boolean;
  canSendDm: boolean;
  postReplyReason?: string;
  sendDmReason?: string;
}

export interface SocialConversation {
  id: string;
  organization?: string;
  organizationId?: string;
  user?: string | null;
  userId?: string | null;
  brand?: string | null;
  brandId?: string | null;
  credential?: string | null;
  credentialId?: string | null;
  post?: string | null;
  postId?: string | null;
  platform: SocialPlatform;
  conversationType: SocialConversationType;
  externalConversationId?: string | null;
  externalThreadId?: string | null;
  externalParentId?: string | null;
  sourceContentId?: string | null;
  sourceContentUrl?: string | null;
  sourceContentTitle?: string | null;
  sourceContentType?: string | null;
  accountExternalId?: string | null;
  accountHandle?: string | null;
  accountName?: string | null;
  participantExternalId?: string | null;
  participantHandle?: string | null;
  participantName?: string | null;
  participantAvatarUrl?: string | null;
  status: SocialConversationStatus;
  priority: string;
  unreadCount: number;
  needsReview: boolean;
  automationState: SocialAutomationState;
  assignedOwnerId?: string | null;
  tags: string[];
  latestMessageText?: string | null;
  latestMessageAt?: string | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  availability?: SocialConversationAvailability;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SocialMessage {
  id: string;
  conversation?: string;
  conversationId?: string;
  organization?: string;
  organizationId?: string;
  user?: string | null;
  userId?: string | null;
  brand?: string | null;
  brandId?: string | null;
  credential?: string | null;
  credentialId?: string | null;
  post?: string | null;
  postId?: string | null;
  platform: SocialPlatform;
  direction: SocialMessageDirection;
  messageType: SocialMessageType;
  body: string;
  externalMessageId?: string | null;
  externalParentMessageId?: string | null;
  senderExternalId?: string | null;
  senderHandle?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  authorRole?: string | null;
  status: string;
  sourceUrl?: string | null;
  idempotencyKey?: string | null;
  workflowRunId?: string | null;
  agentRunId?: string | null;
  workflowTriggerStatus?: SocialMessageWorkflowTriggerStatus | null;
  workflowTriggerJobId?: string | null;
  workflowTriggerError?: string | null;
  workflowTriggerAttemptedAt?: string | null;
  workflowTriggerQueuedAt?: string | null;
  actionProvenance?: SocialActionProvenance;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type SocialInboxReference =
  | {
      brandId?: string;
      conversationId: string;
      kind: 'social-conversation';
      organizationId: string;
    }
  | {
      brandId?: string;
      conversationId: string;
      kind: 'social-message';
      messageId: string;
      organizationId: string;
    };

export interface SocialInboxRealtimeEvent {
  conversationId: string;
  kind: 'conversation-updated' | 'message-created' | 'message-updated';
}

export interface SocialInboxAgentMessageContext {
  body: string;
  direction: SocialMessageDirection;
  messageId: string;
  messageType: SocialMessageType;
}

export interface SocialInboxAgentContextRecord {
  conversationId: string;
  kind: SocialInboxReference['kind'];
  messageId?: string;
  messages: SocialInboxAgentMessageContext[];
}

export interface SocialInboxQuery {
  assignedOwnerId?: string;
  automationState?: SocialAutomationState;
  conversationType?: SocialConversationType;
  credentialId?: string;
  limit?: number;
  needsReview?: boolean;
  page?: number;
  platform?: SocialPlatform;
  search?: string;
  status?: SocialConversationStatus;
  tag?: string;
  unread?: boolean;
}

export interface SocialMessageQuery {
  cursor?: string;
  limit?: number;
  page?: number;
}

export interface SocialActionInput {
  agentRunId?: string;
  idempotencyKey?: string;
  messageType?: 'dm' | 'reply';
  recipientId?: string;
  text: string;
  workflowRunId?: string;
}

export interface YoutubeSyncResult {
  jobId?: string;
  status: string;
}
