import type {
  SocialAutomationState,
  SocialConversation,
  SocialConversationAvailability,
  SocialConversationStatus,
  SocialConversationType,
  SocialPlatform,
} from '@genfeedai/interfaces';

export class SocialConversationModel implements SocialConversation {
  id!: string;
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
  platform!: SocialPlatform | string;
  conversationType!: SocialConversationType | string;
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
  status!: SocialConversationStatus | string;
  priority!: string;
  unreadCount!: number;
  needsReview!: boolean;
  automationState!: SocialAutomationState | string;
  assignedOwnerId?: string | null;
  tags!: string[];
  latestMessageText?: string | null;
  latestMessageAt?: string | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  availability?: SocialConversationAvailability;
  metadata?: Record<string, unknown>;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<SocialConversation>) {
    Object.assign(this, partial);
  }
}
