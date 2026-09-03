import type { ContentCampaignStatus } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  ICampaign,
  ICampaignLifecycleItemOutcome,
  ICampaignLifecycleResult,
  IGenerateCampaignContentInput,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { CampaignSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface CreateCampaignInput {
  brandId: string;
  brief?: string | null;
  endDate?: string | null;
  idempotencyKey?: string;
  name: string;
  objective?: string | null;
  startDate?: string | null;
  status?: ContentCampaignStatus;
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

export type GenerateCampaignContentInput = IGenerateCampaignContentInput;

export class CampaignLifecycleResult implements ICampaignLifecycleResult {
  action!: ICampaignLifecycleResult['action'];
  campaign!: Campaign;
  id!: string;
  items!: ICampaignLifecycleItemOutcome[];

  constructor(partial: Partial<ICampaignLifecycleResult>) {
    Object.assign(this, partial);
    this.campaign = new Campaign(partial.campaign ?? {});
    this.items = partial.items ?? [];
  }
}

export interface CampaignListQuery {
  brandId?: string;
  includeArchived?: boolean;
  limit?: number;
  page?: number;
  status?: ContentCampaignStatus | string;
}

export class Campaign implements ICampaign {
  brandId!: string;
  brief?: string | null;
  createdAt!: string;
  endDate?: string | null;
  id!: string;
  isDeleted!: boolean;
  name!: string;
  objective?: string | null;
  organizationId!: string;
  startDate?: string | null;
  status!: ContentCampaignStatus;
  updatedAt!: string;
  userId!: string;

  constructor(partial: Partial<ICampaign>) {
    Object.assign(this, partial);
  }
}

export class CampaignsService extends BaseService<
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput
> {
  constructor(token: string) {
    super(API_ENDPOINTS.CAMPAIGNS, token, Campaign, CampaignSerializer);
  }

  public static getInstance(token: string): CampaignsService {
    return BaseService.getDataServiceInstance(CampaignsService, token);
  }

  async list(
    query: CampaignListQuery = {},
  ): Promise<IPaginatedResponse<Campaign>> {
    return this.findAllPage(query as Record<string, unknown>);
  }

  async getById(id: string): Promise<Campaign> {
    return this.findOne(id);
  }

  async create(data: CreateCampaignInput): Promise<Campaign> {
    return this.post(data);
  }

  async update(id: string, data: UpdateCampaignInput): Promise<Campaign> {
    return this.patch(id, data);
  }

  async archive(id: string): Promise<Campaign> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/archive`,
      this.instance
        .post<JsonApiResponseDocument>(`/${id}/archive`, {})
        .then((response) => this.mapOne(response.data)),
    );
  }

  async restore(id: string, status?: ContentCampaignStatus): Promise<Campaign> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/restore`,
      this.instance
        .post<JsonApiResponseDocument>(`/${id}/restore`, {
          ...(status ? { status } : {}),
        })
        .then((response) => this.mapOne(response.data)),
    );
  }

  async start(id: string): Promise<CampaignLifecycleResult> {
    return this.postLifecycle(id, 'start');
  }

  async pause(id: string): Promise<CampaignLifecycleResult> {
    return this.postLifecycle(id, 'pause');
  }

  async complete(id: string): Promise<CampaignLifecycleResult> {
    return this.postLifecycle(id, 'complete');
  }

  async generate(
    id: string,
    input: GenerateCampaignContentInput = {},
  ): Promise<CampaignLifecycleResult> {
    return this.postLifecycle(id, 'generate', input);
  }

  async assignPosts(
    id: string,
    postIds: string[],
  ): Promise<CampaignLifecycleResult> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/posts`,
      this.instance
        .post<JsonApiResponseDocument>(`/${id}/posts`, { postIds })
        .then((response) => this.mapLifecycle(response.data)),
    );
  }

  async unassignPosts(
    id: string,
    postIds: string[],
  ): Promise<CampaignLifecycleResult> {
    return this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${id}/posts`,
      this.instance
        .delete<JsonApiResponseDocument>(`/${id}/posts`, {
          data: { postIds },
        })
        .then((response) => this.mapLifecycle(response.data)),
    );
  }

  private postLifecycle(
    id: string,
    action: 'complete' | 'generate' | 'pause' | 'start',
    body: GenerateCampaignContentInput = {},
  ): Promise<CampaignLifecycleResult> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/${action}`,
      this.instance
        .post<JsonApiResponseDocument>(`/${id}/${action}`, body)
        .then((response) => this.mapLifecycle(response.data)),
    );
  }

  private mapLifecycle(
    document: JsonApiResponseDocument,
  ): CampaignLifecycleResult {
    return new CampaignLifecycleResult(
      this.extractResource<ICampaignLifecycleResult>(document),
    );
  }
}
