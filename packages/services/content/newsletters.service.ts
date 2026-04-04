import {
  buildSerializer,
  newsletterSerializerConfig,
} from '@genfeedai/serializers';
import { Newsletter } from '@models/content/newsletter.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface GenerateNewsletterTopicsRequest {
  count?: number;
  instructions?: string;
}

export interface GenerateNewsletterDraftRequest {
  angle?: string;
  contextNewsletterIds?: string[];
  instructions?: string;
  newsletterId?: string;
  sourceRefs?: Array<{
    label: string;
    note?: string;
    sourceType: 'url' | 'manual' | 'context' | 'newsletter';
    url?: string;
  }>;
  topic: string;
}

export interface UpdateNewsletterRequest {
  angle?: string;
  content?: string;
  contextNewsletterIds?: string[];
  label?: string;
  sourceRefs?: Array<{
    label: string;
    note?: string;
    sourceType: 'url' | 'manual' | 'context' | 'newsletter';
    url?: string;
  }>;
  status?: Newsletter['status'];
  summary?: string;
  topic?: string;
}

const { NewsletterSerializer } = buildSerializer(
  'client',
  newsletterSerializerConfig,
);

export class NewslettersService extends BaseService<Newsletter> {
  constructor(token: string) {
    super('/newsletters', token, Newsletter, NewsletterSerializer);
  }

  public static getInstance(token: string): NewslettersService {
    return BaseService.getDataServiceInstance(
      NewslettersService,
      token,
    ) as NewslettersService;
  }

  public async generateTopicProposals(
    data: GenerateNewsletterTopicsRequest,
  ): Promise<Array<{ angle: string; reason: string; title: string }>> {
    const response = await this.instance.post<{
      data: Array<{ angle: string; reason: string; title: string }>;
    }>('topic-proposals', data);
    return response.data.data;
  }

  public async generateDraft(
    data: GenerateNewsletterDraftRequest,
  ): Promise<Newsletter> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      'generate-draft',
      data,
    );
    return this.mapOne(response.data);
  }

  public async approve(id: string): Promise<Newsletter> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${id}/approve`,
      {},
    );
    return this.mapOne(response.data);
  }

  public async publish(id: string): Promise<Newsletter> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${id}/publish`,
      {},
    );
    return this.mapOne(response.data);
  }

  public async archive(id: string): Promise<Newsletter> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${id}/archive`,
      {},
    );
    return this.mapOne(response.data);
  }

  public async getContext(id: string): Promise<{
    brandVoice: unknown;
    contextSources: Array<{
      label: string;
      summary: string;
      type?: string | null;
      url?: string | null;
    }>;
    recentNewsletters: Array<{
      id: string;
      label: string;
      publishedAt?: string;
      summary?: string;
      status: string;
      topic: string;
    }>;
    selectedContext: Array<{
      id: string;
      label: string;
      publishedAt?: string;
      summary?: string;
      status: string;
      topic: string;
    }>;
    selectedContextIds: string[];
    sourceRefs: Array<{
      label: string;
      note: string;
      sourceType: 'url' | 'manual' | 'context' | 'newsletter';
      url?: string | null;
    }>;
    status: Newsletter['status'];
    summary: string;
    topic: string;
    updatedAt?: string;
  }> {
    const response = await this.instance.get<{
      data: {
        brandVoice: unknown;
        contextSources: Array<{
          label: string;
          summary: string;
          type?: string | null;
          url?: string | null;
        }>;
        recentNewsletters: Array<{
          id: string;
          label: string;
          publishedAt?: string;
          summary?: string;
          status: string;
          topic: string;
        }>;
        selectedContext: Array<{
          id: string;
          label: string;
          publishedAt?: string;
          summary?: string;
          status: string;
          topic: string;
        }>;
        selectedContextIds: string[];
        sourceRefs: Array<{
          label: string;
          note: string;
          sourceType: 'url' | 'manual' | 'context' | 'newsletter';
          url?: string | null;
        }>;
        status: Newsletter['status'];
        summary: string;
        topic: string;
        updatedAt?: string;
      };
    }>(`${id}/context`);

    return response.data.data;
  }
}
