import { API_ENDPOINTS } from '@genfeedai/constants';
import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

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
  conversationsCreated: number;
  messagesCreated: number;
}

const socialConversationSerializer: IServiceSerializer<SocialConversation> = {
  serialize: (data) => data,
};

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

export class SocialMessagesService extends BaseService<
  SocialConversationModel,
  SocialActionInput,
  Partial<SocialConversation>
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.MESSAGES,
      token,
      SocialConversationModel,
      socialConversationSerializer,
    );
  }

  public static getInstance(token: string): SocialMessagesService {
    return BaseService.getDataServiceInstance(SocialMessagesService, token);
  }

  list(params: SocialInboxQuery = {}): Promise<SocialConversationModel[]> {
    return this.findAll(params as Record<string, unknown>);
  }

  getConversation(
    id: string,
    signal?: AbortSignal,
  ): Promise<SocialConversationModel> {
    return this.findOne(id, {}, signal);
  }

  listMessages(
    conversationId: string,
    params: SocialMessageQuery = {},
    signal?: AbortSignal,
  ): Promise<SocialMessageModel[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${conversationId}/messages`,
      this.instance
        .get<JsonApiResponseDocument>(`/${conversationId}/messages`, {
          params,
          signal,
        })
        .then((response) => response.data)
        .then((document) =>
          this.extractCollection<Partial<SocialMessage>>(document).map(
            (item) => new SocialMessageModel(item),
          ),
        ),
    );
  }

  createDraft(
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageModel> {
    return this.postMessageAction(conversationId, 'drafts', input);
  }

  approveDraft(
    conversationId: string,
    messageId: string,
  ): Promise<SocialMessageModel> {
    return this.patchDraft(conversationId, messageId, { status: 'approved' });
  }

  rejectDraft(
    conversationId: string,
    messageId: string,
    reason?: string,
  ): Promise<SocialMessageModel> {
    return this.patchDraft(conversationId, messageId, {
      reason,
      status: 'rejected',
    });
  }

  postReply(
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageModel> {
    return this.postMessageAction(conversationId, 'replies', input);
  }

  sendDm(
    conversationId: string,
    input: SocialActionInput,
  ): Promise<SocialMessageModel> {
    return this.postMessageAction(conversationId, 'dms', input);
  }

  updateStatus(
    conversationId: string,
    status: SocialConversationStatus,
  ): Promise<SocialConversationModel> {
    return this.patch(conversationId, { status });
  }

  updateTags(
    conversationId: string,
    tags: string[],
  ): Promise<SocialConversationModel> {
    return this.patch(conversationId, { tags });
  }

  assignOwner(
    conversationId: string,
    assignedOwnerId: string | null,
  ): Promise<SocialConversationModel> {
    // Sent via the raw client rather than `patch()` because unassigning
    // requires an explicit `null`, which `patch()` strips as an empty value.
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${conversationId}`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${conversationId}`, {
          assignedOwnerId,
        })
        .then((response) => this.mapOne(response.data)),
    );
  }

  syncYoutube(limit = 25): Promise<YoutubeSyncResult> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/youtube/sync`,
      this.instance
        .post<YoutubeSyncResult>('/youtube/sync', { limit })
        .then((response) => response.data),
    );
  }

  private postMessageAction(
    conversationId: string,
    action: 'dms' | 'drafts' | 'replies' | string,
    input: Partial<SocialActionInput> & { reason?: string },
  ): Promise<SocialMessageModel> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${conversationId}/${action}`,
      this.instance
        .post<JsonApiResponseDocument>(`/${conversationId}/${action}`, input)
        .then((response) => response.data)
        .then(
          (document) =>
            new SocialMessageModel(
              this.extractResource<Partial<SocialMessage>>(document),
            ),
        ),
    );
  }

  private patchDraft(
    conversationId: string,
    messageId: string,
    input: { status: 'approved' | 'rejected'; reason?: string },
  ): Promise<SocialMessageModel> {
    const path = `/${conversationId}/drafts/${messageId}`;
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}${path}`,
      this.instance
        .patch<JsonApiResponseDocument>(path, input)
        .then((response) => response.data)
        .then(
          (document) =>
            new SocialMessageModel(
              this.extractResource<Partial<SocialMessage>>(document),
            ),
        ),
    );
  }
}
