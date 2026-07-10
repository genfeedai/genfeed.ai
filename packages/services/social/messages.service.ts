import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  SocialActionInput,
  SocialConversation,
  SocialConversationStatus,
  SocialInboxQuery,
  SocialMessage,
  SocialMessageQuery,
  YoutubeSyncResult,
} from '@genfeedai/interfaces';
import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import { SocialMessageModel } from '@genfeedai/models/social/social-message.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

const socialConversationSerializer: IServiceSerializer<SocialConversation> = {
  serialize: (data) => data,
};

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
