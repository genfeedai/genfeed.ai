import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  IReferralAdminReward,
  IReferralClaimResult,
  IReferralProgram,
} from '@genfeedai/interfaces';
import { ReferralProgram } from '@genfeedai/models/billing/referral-program.model';
import { ReferralProgramSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class ReferralsService extends BaseService<ReferralProgram> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.REFERRALS,
      token,
      ReferralProgram,
      ReferralProgramSerializer,
    );
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

  public async getAdminRewards(): Promise<IReferralAdminReward[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      'admin/rewards?limit=100',
    );
    return deserializeCollection<IReferralAdminReward>(response.data);
  }
}
