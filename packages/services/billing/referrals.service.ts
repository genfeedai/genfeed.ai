import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IReferralAdminReward,
  IReferralClaimResult,
  IReferralProgram,
} from '@genfeedai/contracts/interfaces';
import { ReferralProgram } from '@genfeedai/models/billing/referral-program.model';
import { PagesService } from '@services/content/pages.service';
import { BaseService } from '@services/core/base.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class ReferralsService extends BaseService<ReferralProgram> {
  constructor(token: string) {
    super(API_ENDPOINTS.REFERRALS, token, ReferralProgram);
  }

  public static getInstance(token: string): ReferralsService {
    return BaseService.getDataServiceInstance(ReferralsService, token);
  }

  public async getMine(): Promise<IReferralProgram> {
    const response = await this.instance.get<JsonApiResponseDocument>('me');
    return deserializeResource<IReferralProgram>(response.data);
  }

  public async claim(code: string): Promise<IReferralClaimResult> {
    const response = await this.instance.post<IReferralClaimResult>(
      'me/claim',
      {
        code,
      },
    );
    return response.data;
  }

  public async getAdminRewards(
    query: { limit: number; page: number } = { limit: 15, page: 1 },
  ): Promise<IReferralAdminReward[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      'admin/rewards',
      { params: query },
    );
    const pagination = response.data.links?.pagination;
    if (pagination) {
      PagesService.setCurrentPage(pagination.page ?? 1);
      PagesService.setTotalPages(pagination.pages ?? 1);
      PagesService.setTotalDocs(pagination.total ?? 0);
    }
    return deserializeCollection<IReferralAdminReward>(response.data);
  }
}
