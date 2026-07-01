import type { BaseApiClient } from './base-api-client';
import type { JsonApiResource } from './client.types';

export interface SocialConversationListParams {
  assignedOwnerId?: string;
  automationState?: string;
  conversationType?: string;
  credentialId?: string;
  limit?: number;
  needsReview?: boolean;
  page?: number;
  platform?: string;
  search?: string;
  status?: string;
  tag?: string;
  unread?: boolean;
}

export interface SocialMessageListParams {
  cursor?: string;
  limit?: number;
  page?: number;
}

export interface SocialActionParams {
  agentRunId?: string;
  idempotencyKey?: string;
  messageType?: 'dm' | 'reply';
  recipientId?: string;
  text: string;
  workflowRunId?: string;
}

export interface SocialConversationDetail {
  conversation: Record<string, unknown>;
  messages?: Record<string, unknown>[];
}

export interface SocialConversationListResult {
  conversations: Record<string, unknown>[];
  meta?: Record<string, unknown>;
}

/**
 * MCP client for the durable social inbox API.
 */
export class SocialMessagesClient {
  constructor(private readonly base: BaseApiClient) {}

  listConversations(
    params: SocialConversationListParams = {},
  ): Promise<SocialConversationListResult> {
    this.base.logger.debug('Listing social conversations', { params });

    return this.base.request(
      'listing social conversations',
      async (http) => {
        const response = await http.get('/messages', { params });
        return {
          conversations: this.mapCollection(response.data?.data),
          meta: this.mapOptionalObject(response.data?.meta),
        };
      },
      this.base.failWithDetail('Failed to list social conversations'),
    );
  }

  getConversation(conversationId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug('Getting social conversation', { conversationId });

    return this.base.request(
      'getting social conversation',
      async (http) => {
        const response = await http.get(`/messages/${conversationId}`);
        return this.mapResource(response.data?.data);
      },
      this.base.failWithDetail('Failed to get social conversation'),
    );
  }

  listMessages(
    conversationId: string,
    params: SocialMessageListParams = {},
  ): Promise<Record<string, unknown>[]> {
    this.base.logger.debug('Listing social messages', {
      conversationId,
      params,
    });

    return this.base.request(
      'listing social messages',
      async (http) => {
        const response = await http.get(
          `/messages/${conversationId}/messages`,
          {
            params,
          },
        );
        return this.mapCollection(response.data?.data);
      },
      this.base.failWithDetail('Failed to list social messages'),
    );
  }

  async getConversationDetail(
    conversationId: string,
    options: { includeMessages?: boolean; limit?: number } = {},
  ): Promise<SocialConversationDetail> {
    const conversation = await this.getConversation(conversationId);
    if (options.includeMessages === false) {
      return { conversation };
    }

    const messages = await this.listMessages(conversationId, {
      limit: options.limit ?? 50,
    });

    return { conversation, messages };
  }

  createDraft(
    conversationId: string,
    params: SocialActionParams,
  ): Promise<Record<string, unknown>> {
    return this.postMessageAction(conversationId, 'drafts', params);
  }

  approveDraft(
    conversationId: string,
    messageId: string,
  ): Promise<Record<string, unknown>> {
    return this.postMessageAction(
      conversationId,
      `drafts/${messageId}/approve`,
      {},
    );
  }

  rejectDraft(
    conversationId: string,
    messageId: string,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    return this.postMessageAction(
      conversationId,
      `drafts/${messageId}/reject`,
      reason ? { reason } : {},
    );
  }

  postReply(
    conversationId: string,
    params: SocialActionParams,
  ): Promise<Record<string, unknown>> {
    return this.postMessageAction(conversationId, 'replies', params);
  }

  sendDm(
    conversationId: string,
    params: SocialActionParams,
  ): Promise<Record<string, unknown>> {
    return this.postMessageAction(conversationId, 'dms', params);
  }

  updateTags(
    conversationId: string,
    tags: string[],
  ): Promise<Record<string, unknown>> {
    return this.patchConversation(conversationId, 'tags', { tags });
  }

  assignConversation(
    conversationId: string,
    assignedOwnerId?: string | null,
  ): Promise<Record<string, unknown>> {
    return this.patchConversation(conversationId, 'assignment', {
      assignedOwnerId: assignedOwnerId ?? null,
    });
  }

  markResolved(conversationId: string): Promise<Record<string, unknown>> {
    return this.patchConversation(conversationId, 'status', {
      status: 'resolved',
    });
  }

  private postMessageAction(
    conversationId: string,
    action: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      `posting social message action ${action}`,
      async (http) => {
        const response = await http.post(
          `/messages/${conversationId}/${action}`,
          payload,
        );
        return this.mapResource(response.data?.data);
      },
      this.base.failWithDetail('Failed to update social conversation'),
    );
  }

  private patchConversation(
    conversationId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      `patching social conversation ${action}`,
      async (http) => {
        const response = await http.patch(
          `/messages/${conversationId}/${action}`,
          payload,
        );
        return this.mapResource(response.data?.data);
      },
      this.base.failWithDetail('Failed to update social conversation'),
    );
  }

  private mapCollection(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.map((item) => this.mapResource(item))
      : [];
  }

  private mapResource(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const resource = value as JsonApiResource;
    const attributes = this.mapOptionalObject(resource.attributes);
    return {
      id:
        resource.id ??
        (typeof attributes.id === 'string' ? attributes.id : undefined),
      ...attributes,
    };
  }

  private mapOptionalObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
