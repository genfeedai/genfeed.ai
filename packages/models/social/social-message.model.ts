import type {
  SocialActionProvenance,
  SocialMessage,
  SocialMessageDirection,
  SocialMessageType,
  SocialPlatform,
} from '@genfeedai/interfaces';

export class SocialMessageModel implements SocialMessage {
  id!: string;
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
  platform!: SocialPlatform | string;
  direction!: SocialMessageDirection | string;
  messageType!: SocialMessageType | string;
  body!: string;
  externalMessageId?: string | null;
  externalParentMessageId?: string | null;
  senderExternalId?: string | null;
  senderHandle?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  authorRole?: string | null;
  status!: string;
  sourceUrl?: string | null;
  idempotencyKey?: string | null;
  workflowRunId?: string | null;
  agentRunId?: string | null;
  actionProvenance?: SocialActionProvenance;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<SocialMessage>) {
    Object.assign(this, partial);
  }
}
