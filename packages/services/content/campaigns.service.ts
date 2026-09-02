import { API_ENDPOINTS } from '@genfeedai/constants';
import type { ContentCampaignStatus } from '@genfeedai/enums';
import type { ICampaign, IPaginatedResponse } from '@genfeedai/interfaces';
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
    return this.post(`${id}/archive`, {} as CreateCampaignInput);
  }

  async restore(id: string, status?: ContentCampaignStatus): Promise<Campaign> {
    return this.post(`${id}/restore`, {
      ...(status ? { status } : {}),
    } as CreateCampaignInput);
  }

  async assignPosts(id: string, postIds: string[]): Promise<Campaign> {
    return this.post(`${id}/posts`, { postIds } as CreateCampaignInput);
  }

  async unassignPosts(id: string, postIds: string[]): Promise<Campaign> {
    return this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${id}/posts`,
      this.instance
        .delete<JsonApiResponseDocument>(`/${id}/posts`, {
          data: { postIds },
        })
        .then((response) => this.mapOne(response.data)),
    );
  }
}
