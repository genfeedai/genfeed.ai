export type SocialPlatform =
  | 'instagram'
  | 'linkedin'
  | 'twitter'
  | 'unipile'
  | 'youtube';

export type SocialConversationStatus =
  | 'archived'
  | 'needs_review'
  | 'open'
  | 'resolved';

export type SocialAutomationState =
  | 'approved'
  | 'automated'
  | 'drafted'
  | 'failed'
  | 'manual'
  | 'pending_approval';

export type SocialConversationType = 'comment' | 'dm' | 'mention' | 'reply';
export type SocialMessageDirection = 'inbound' | 'outbound' | 'system';
export type SocialMessageType = 'comment' | 'dm' | 'draft' | 'note' | 'reply';
export type SocialActionActorType = 'agent' | 'system' | 'user' | 'workflow';

export interface SocialActionProvenance {
  action?: string;
  actedAt?: string;
  actorType?: SocialActionActorType | string;
  agentRunId?: string | null;
  approvedAt?: string;
  approvedBy?: string | null;
  approvedMessageId?: string;
  platform?: SocialPlatform | string;
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
  platform: SocialPlatform | string;
  conversationType: SocialConversationType | string;
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
  status: SocialConversationStatus | string;
  priority: string;
  unreadCount: number;
  needsReview: boolean;
  automationState: SocialAutomationState | string;
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
  platform: SocialPlatform | string;
  direction: SocialMessageDirection | string;
  messageType: SocialMessageType | string;
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
  actionProvenance?: SocialActionProvenance;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
