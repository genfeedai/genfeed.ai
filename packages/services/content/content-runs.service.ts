import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type { ContentRunBrief } from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface CreateResearchBriefRunInput {
  angle?: string;
  audience?: string;
  authorHandle?: string;
  callToAction?: string;
  channelFit?: string;
  confidence?: number;
  contentType?: string;
  evidence?: string[];
  hypothesis?: string;
  matchedTrends?: string[];
  metrics?: Record<string, unknown>;
  platform: string;
  risk?: string;
  sourceContentId?: string;
  sourceReferenceId?: string;
  sourceUrl?: string;
  text?: string;
  title?: string;
  trendId: string;
  trendTopic: string;
}

export interface ContentRunRecord {
  _id?: string;
  brand?: string;
  brief?: ContentRunBrief;
  id?: string;
  organization?: string;
  skillSlug?: string;
  status?: string;
}

export class ContentRunsService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): ContentRunsService {
    return HTTPBaseService.getBaseServiceInstance(
      ContentRunsService,
      token,
    ) as ContentRunsService;
  }

  async createResearchBriefRun(
    brandId: string,
    input: CreateResearchBriefRunInput,
  ): Promise<ContentRunRecord> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/brands/${brandId}/content-runs/briefs`,
      input,
    );

    return deserializeResource<ContentRunRecord>(response.data);
  }
}
