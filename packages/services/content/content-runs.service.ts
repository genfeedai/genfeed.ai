import type { ContentRunStatus } from '@genfeedai/contracts';
import {
  type BrandRemixRunView,
  brandRemixRunViewSchema,
  type CreateBrandRemixRun,
  type PreparePausedMetaCampaignDraft,
  type ReviseBrandRemixRun,
  type StartBrandRemixRun,
  type SubmitBrandRemixRunForReview,
} from '@genfeedai/contracts/api-types/contracts';
import type { ContentRunBrief } from '@genfeedai/contracts/interfaces';
import type {
  ContentRunAnalyticsSummary,
  ContentRunPublishContext,
  ContentRunRecommendation,
  ContentRunVariant,
} from '@genfeedai/contracts/interfaces/content/content-run.interface';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

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
  analyticsSummary?: ContentRunAnalyticsSummary;
  brandId?: string;
  brief?: ContentRunBrief;
  createdAt?: string;
  creditsUsed?: number;
  duration?: number;
  error?: string;
  id: string;
  input?: Record<string, unknown>;
  organizationId: string;
  output?: unknown;
  publish?: ContentRunPublishContext;
  recommendations?: ContentRunRecommendation[];
  skillSlug?: string;
  source?: string;
  status?: string;
  updatedAt?: string;
  variants?: ContentRunVariant[];
}

export interface ListContentRunsFilters {
  skillSlug?: string;
  status?: ContentRunStatus;
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

  async list(
    brandId: string,
    filters: ListContentRunsFilters = {},
  ): Promise<ContentRunRecord[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/brands/${brandId}/content-runs`,
      {
        params: {
          ...(filters.skillSlug ? { skillSlug: filters.skillSlug } : {}),
          ...(filters.status ? { status: filters.status } : {}),
        },
      },
    );

    return deserializeCollection<ContentRunRecord>(response.data);
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

  async createBrandRemixRun(
    brandId: string,
    input: CreateBrandRemixRun,
  ): Promise<BrandRemixRunView> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/brands/${brandId}/content-runs/remixes`,
      input,
    );

    return brandRemixRunViewSchema.parse(
      deserializeResource<BrandRemixRunView>(response.data),
    );
  }

  async findBrandRemixRun(
    runId: string,
    signal?: AbortSignal,
  ): Promise<BrandRemixRunView> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/content-runs/${runId}/remix`,
      { signal },
    );

    return brandRemixRunViewSchema.parse(
      deserializeResource<BrandRemixRunView>(response.data),
    );
  }

  async reviseBrandRemixRun(
    runId: string,
    input: ReviseBrandRemixRun,
  ): Promise<BrandRemixRunView> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/content-runs/${runId}/remix`,
      input,
    );

    return brandRemixRunViewSchema.parse(
      deserializeResource<BrandRemixRunView>(response.data),
    );
  }

  async startBrandRemixRun(
    runId: string,
    input: StartBrandRemixRun,
  ): Promise<BrandRemixRunView> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/content-runs/${runId}/remix/start`,
      input,
    );

    return brandRemixRunViewSchema.parse(
      deserializeResource<BrandRemixRunView>(response.data),
    );
  }

  async submitBrandRemixRunForReview(
    runId: string,
    input: SubmitBrandRemixRunForReview,
  ): Promise<BrandRemixRunView> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/content-runs/${runId}/remix/review`,
      input,
    );

    return brandRemixRunViewSchema.parse(
      deserializeResource<BrandRemixRunView>(response.data),
    );
  }

  async prepareBrandRemixPausedDraft(
    runId: string,
    input: PreparePausedMetaCampaignDraft,
  ): Promise<BrandRemixRunView> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/content-runs/${runId}/remix/paid-draft`,
      input,
    );

    return brandRemixRunViewSchema.parse(
      deserializeResource<BrandRemixRunView>(response.data),
    );
  }

  async findOne(runId: string): Promise<ContentRunRecord> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/content-runs/${runId}`,
    );

    return deserializeResource<ContentRunRecord>(response.data);
  }

  async analyzeRecommendations(runId: string): Promise<ContentRunRecord> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/content-runs/${runId}/recommendations`,
    );

    return deserializeResource<ContentRunRecord>(response.data);
  }

  async createRemixPack(runId: string): Promise<ContentRunRecord> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/content-runs/${runId}/remix-pack`,
    );

    return deserializeResource<ContentRunRecord>(response.data);
  }
}
