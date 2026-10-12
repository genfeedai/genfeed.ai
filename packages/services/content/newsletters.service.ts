import type {
  IChannelTarget,
  INewsletterDeliveryRequest,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { Newsletter } from '@genfeedai/models/content/newsletter.model';
import {
  buildSerializer,
  newsletterSerializerConfig,
} from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import {
  deserializeResource,
  extractCollection,
} from '@services/core/json-api';

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
  externalUrl?: string | null;
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
    return BaseService.getDataServiceInstance(NewslettersService, token);
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
      { timeout: 600_000 },
    );
    return this.mapOne(response.data);
  }

  public async approve(id: string): Promise<Newsletter> {
    const response = await this.instance.patch<JsonApiResponseDocument>(id, {
      action: 'approve',
    });
    return this.mapOne(response.data);
  }

  public async publish(id: string): Promise<Newsletter> {
    const response = await this.instance.patch<JsonApiResponseDocument>(id, {
      action: 'publish',
    });
    return this.mapOne(response.data);
  }

  /**
   * Deliver the issue to a connected Beehiiv publication: send now, create a
   * Beehiiv draft, or schedule the send. Returns the queued release.
   */
  public async deliver(
    id: string,
    data: INewsletterDeliveryRequest,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${id}/deliveries`,
      data,
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  /** Delivery targets of this issue, newest first, with their live URLs. */
  public async findDeliveries(
    id: string,
    signal?: AbortSignal,
  ): Promise<IChannelTarget[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `${id}/deliveries`,
      { signal },
    );
    return extractCollection<IChannelTarget>(response.data);
  }

  public async archive(id: string): Promise<Newsletter> {
    return this.patch(id, { status: 'archived' });
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
