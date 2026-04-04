import type {
  ITwitterOpportunity,
  ITwitterPublishRequest,
  ITwitterPublishResult,
  ITwitterSearchResult,
  ITwitterVoiceConfig,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class TwitterPipelineService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/organizations`, token);
  }

  static getInstance(token: string): TwitterPipelineService {
    return HTTPBaseService.getBaseServiceInstance(
      TwitterPipelineService,
      token,
    ) as TwitterPipelineService;
  }

  /**
   * Search for relevant tweets to engage with.
   * Backend expects: { brandId, query, maxResults? }
   * Frontend provides: ITwitterVoiceConfig + brandId
   */
  async search(
    orgId: string,
    brandId: string,
    voiceConfig: ITwitterVoiceConfig,
    maxResults?: number,
  ): Promise<ITwitterSearchResult[]> {
    const response = await this.instance.post<ITwitterSearchResult[]>(
      `/${orgId}/twitter-pipeline/search`,
      {
        brandId,
        maxResults,
        query: voiceConfig.searchQuery,
      },
    );
    return response.data;
  }

  /**
   * Generate AI draft replies/quotes/originals from search results.
   * Backend expects: { searchResults, voiceConfig }
   */
  async draft(
    orgId: string,
    searchResults: ITwitterSearchResult[],
    voiceConfig: ITwitterVoiceConfig,
  ): Promise<ITwitterOpportunity[]> {
    const response = await this.instance.post<ITwitterOpportunity[]>(
      `/${orgId}/twitter-pipeline/draft`,
      {
        searchResults,
        voiceConfig,
      },
    );
    return response.data;
  }

  /**
   * Publish a tweet (reply, quote, or original).
   * Backend expects: { brandId, type, text, targetTweetId? }
   */
  async publish(
    orgId: string,
    brandId: string,
    dto: ITwitterPublishRequest,
  ): Promise<ITwitterPublishResult> {
    const response = await this.instance.post<ITwitterPublishResult>(
      `/${orgId}/twitter-pipeline/publish`,
      {
        brandId,
        ...dto,
      },
    );
    return response.data;
  }
}
