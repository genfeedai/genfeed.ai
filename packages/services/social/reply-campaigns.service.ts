import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IPaginatedResponse,
  SocialReplyCampaign,
  SocialReplyCampaignInput,
  SocialReplyCampaignPatch,
  SocialReplyCampaignQuery,
  SocialReplyCampaignRecipient,
  SocialReplyCampaignRecipientQuery,
} from '@genfeedai/contracts/interfaces';
import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import { SocialReplyCampaignRecipientModel } from '@genfeedai/models/social/social-reply-campaign-recipient.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

/** Every state change a running campaign accepts from the UI. */
export type SocialReplyCampaignTransition =
  | 'cancel'
  | 'pause'
  | 'resume'
  | 'start';

const socialReplyCampaignSerializer: IServiceSerializer<SocialReplyCampaign> = {
  serialize: (data) => data,
};

export class SocialReplyCampaignsService extends BaseService<
  SocialReplyCampaignModel,
  SocialReplyCampaignInput,
  SocialReplyCampaignPatch
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.MESSAGE_CAMPAIGNS,
      token,
      SocialReplyCampaignModel,
      socialReplyCampaignSerializer,
    );
  }

  public static getInstance(token: string): SocialReplyCampaignsService {
    return BaseService.getDataServiceInstance(
      SocialReplyCampaignsService,
      token,
    );
  }

  listPage(
    params: SocialReplyCampaignQuery = {},
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<SocialReplyCampaignModel>> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}`,
      this.instance
        .get<JsonApiResponseDocument>('', { params, signal })
        .then((response) => response.data)
        .then(async (document) => {
          const items = await this.mapMany(document);
          return this.toPage(items, document, params);
        }),
    );
  }

  getCampaign(
    campaignId: string,
    signal?: AbortSignal,
  ): Promise<SocialReplyCampaignModel> {
    return this.findOne(campaignId, {}, signal);
  }

  createCampaign(
    input: SocialReplyCampaignInput,
  ): Promise<SocialReplyCampaignModel> {
    return this.post(input);
  }

  patchCampaign(
    campaignId: string,
    input: SocialReplyCampaignPatch,
  ): Promise<SocialReplyCampaignModel> {
    return this.patch(campaignId, input);
  }

  removeCampaign(campaignId: string): Promise<SocialReplyCampaignModel> {
    return this.delete(campaignId);
  }

  transition(
    campaignId: string,
    transition: SocialReplyCampaignTransition,
  ): Promise<SocialReplyCampaignModel> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${campaignId}/status`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${campaignId}/status`, { transition })
        .then((response) => this.mapOne(response.data)),
    );
  }

  listRecipientsPage(
    campaignId: string,
    params: SocialReplyCampaignRecipientQuery = {},
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<SocialReplyCampaignRecipientModel>> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${campaignId}/recipients`,
      this.instance
        .get<JsonApiResponseDocument>(`/${campaignId}/recipients`, {
          params,
          signal,
        })
        .then((response) => response.data)
        .then((document) => {
          const items = this.extractCollection<
            Partial<SocialReplyCampaignRecipient>
          >(document).map(
            (item) => new SocialReplyCampaignRecipientModel(item),
          );
          return this.toPage(items, document, params);
        }),
    );
  }

  private toPage<T>(
    items: T[],
    document: JsonApiResponseDocument,
    params: { limit?: number; page?: number },
  ): IPaginatedResponse<T> {
    const pagination = document.links?.pagination;
    const page = pagination?.page ?? params.page ?? 1;
    const pageSize = Math.max(
      1,
      pagination?.limit ?? params.limit ?? items.length,
    );
    const total = pagination?.total ?? items.length;
    const totalPages =
      pagination?.pages ?? Math.max(1, Math.ceil(total / pageSize));

    return {
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      items,
      page,
      pageSize,
      total,
      totalPages,
    };
  }
}
