import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IPaginatedResponse,
  IReferralAdminReward,
  IReferralClaimResult,
  IReferralProgram,
} from '@genfeedai/contracts/interfaces';
import { ReferralProgram } from '@genfeedai/models/billing/referral-program.model';
import { BaseService } from '@services/core/base.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { toPaginatedResponse } from '@services/core/paginated-response';

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
    query: { limit: number; page: number; search?: string; sort?: string } = {
      limit: 15,
      page: 1,
    },
  ): Promise<IPaginatedResponse<IReferralAdminReward>> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      'admin/rewards',
      { params: query },
    );
    const items = deserializeCollection<IReferralAdminReward>(response.data);
    return toPaginatedResponse(items, response.data);
  }
}
