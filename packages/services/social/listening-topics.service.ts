import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  CreateListeningTopicInput,
  IListeningEvidence,
  UpdateListeningTopicInput,
} from '@genfeedai/interfaces';
import {
  ListeningEvidence,
  ListeningTopic,
} from '@genfeedai/models/social/listening-topic.model';
import { ListeningTopicSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';

export class ListeningTopicsService extends BaseService<
  ListeningTopic,
  CreateListeningTopicInput,
  UpdateListeningTopicInput
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.LISTENING_TOPICS,
      token,
      ListeningTopic,
      ListeningTopicSerializer,
    );
  }

  public static getInstance(token: string): ListeningTopicsService {
    return BaseService.getDataServiceInstance(ListeningTopicsService, token);
  }

  async listEvidence(
    topicId: string,
    options: { brand?: string; page?: number; limit?: number } = {},
  ): Promise<IListeningEvidence[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${topicId}/evidence`,
      { params: options },
    );
    return this.extractCollection<Partial<IListeningEvidence>>(
      response.data,
    ).map((evidence) => new ListeningEvidence(evidence));
  }
}
