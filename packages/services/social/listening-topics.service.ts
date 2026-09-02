import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreateListeningTopicInput,
  IListeningEvidence,
  IListeningSignal,
  IListeningTheme,
  IListeningTopicOutcome,
  ISocialIntelligenceTopicBundle,
  ListeningInboxScope,
  ReviewListeningThemeState,
  UpdateListeningTopicInput,
} from '@genfeedai/contracts/interfaces';
import {
  ListeningEvidence,
  ListeningTopic,
} from '@genfeedai/models/social/listening-topic.model';
import { ListeningTopicSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

const INBOX_PAGE_SIZE = 100;

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
    scope: ListeningInboxScope,
    signal?: AbortSignal,
  ): Promise<IListeningEvidence[]> {
    return this.collectAllPages<IListeningEvidence>(
      { ...scope },
      async (pageQuery) => {
        const response = await this.executeWithErrorHandling(
          `GET listening topic ${topicId} evidence`,
          this.instance.get<JsonApiResponseDocument>(`/${topicId}/evidence`, {
            params: pageQuery,
            signal,
          }),
        );
        return {
          items: this.extractCollection<Partial<IListeningEvidence>>(
            response.data,
          ).map((evidence) => new ListeningEvidence(evidence)),
          totalPages: response.data.links?.pagination?.pages ?? 1,
        };
      },
    );
  }

  async listThemes(
    topicId: string,
    scope: ListeningInboxScope,
    signal?: AbortSignal,
  ): Promise<IListeningTheme[]> {
    return this.listAnalysisCollection<IListeningTheme>(
      topicId,
      'themes',
      scope,
      signal,
    );
  }

  async listSignals(
    topicId: string,
    scope: ListeningInboxScope,
    signal?: AbortSignal,
  ): Promise<IListeningSignal[]> {
    return this.listAnalysisCollection<IListeningSignal>(
      topicId,
      'signals',
      scope,
      signal,
    );
  }

  async getSocialIntelligenceInbox(
    scope: ListeningInboxScope,
    signal?: AbortSignal,
  ): Promise<ISocialIntelligenceTopicBundle[]> {
    const topics = await this.findAllPages(
      {
        ...scope,
        isActive: true,
        limit: INBOX_PAGE_SIZE,
      },
      signal,
    );

    return Promise.all(
      topics.map(async (topic) => {
        const [themes, signals, evidence] = await Promise.all([
          this.listThemes(topic.id, scope, signal),
          this.listSignals(topic.id, scope, signal),
          this.listEvidence(topic.id, scope, signal),
        ]);
        return { evidence, signals, themes, topic };
      }),
    );
  }

  async reviewTheme(
    topicId: string,
    themeId: string,
    state: ReviewListeningThemeState,
    scope: ListeningInboxScope,
  ): Promise<IListeningTheme> {
    const response = await this.executeWithErrorHandling(
      `PATCH listening theme ${themeId} review`,
      this.instance.patch<JsonApiResponseDocument>(
        `/${topicId}/themes/${themeId}/review`,
        { state },
        { params: scope },
      ),
    );
    return deserializeResource<IListeningTheme>(response.data);
  }

  async listThemeOutcomes(
    topicId: string,
    themeId: string,
    scope: ListeningInboxScope,
  ): Promise<IListeningTopicOutcome[]> {
    const response = await this.executeWithErrorHandling(
      `GET listening theme ${themeId} outcomes`,
      this.instance.get<JsonApiResponseDocument>(
        `/${topicId}/themes/${themeId}/outcomes`,
        { params: scope },
      ),
    );
    return this.extractCollection<IListeningTopicOutcome>(response.data);
  }

  private listAnalysisCollection<T>(
    topicId: string,
    path: 'themes' | 'signals',
    scope: ListeningInboxScope,
    signal?: AbortSignal,
  ): Promise<T[]> {
    return this.collectAllPages<T>({ ...scope }, async (pageQuery) => {
      const response = await this.executeWithErrorHandling(
        `GET listening topic ${topicId} ${path}`,
        this.instance.get<JsonApiResponseDocument>(`/${topicId}/${path}`, {
          params: pageQuery,
          signal,
        }),
      );
      return {
        items: this.extractCollection<T>(response.data),
        totalPages: response.data.links?.pagination?.pages ?? 1,
      };
    });
  }
}
