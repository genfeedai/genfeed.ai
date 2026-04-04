import type {
  AdPack,
  AdsChannel,
  AdsResearchDetail,
  AdsResearchFilters,
  AdsResearchPlatform,
  AdsResearchResponse,
  AdsResearchWorkflowResult,
  CampaignLaunchPrep,
} from '@cloud/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface UnifiedAdAccountOption {
  id: string;
  name: string;
  currency?: string;
  platform?: AdsResearchPlatform;
  status?: string;
  timezone?: string;
}

interface AdDetailParams {
  source: 'public' | 'my_accounts';
  id: string;
  platform?: AdsResearchPlatform;
  channel?: AdsChannel;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
}

interface AdActionInput {
  source: 'public' | 'my_accounts';
  adId: string;
  platform?: AdsResearchPlatform;
  channel?: AdsChannel;
  credentialId?: string;
  adAccountId?: string;
  loginCustomerId?: string;
  brandId?: string;
  brandName?: string;
  industry?: string;
  objective?: string;
}

export class AdsResearchService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/ads/research`, token);
  }

  public static getInstance(token: string): AdsResearchService {
    return HTTPBaseService.getBaseServiceInstance(
      AdsResearchService,
      token,
    ) as AdsResearchService;
  }

  public async list(filters: AdsResearchFilters): Promise<AdsResearchResponse> {
    return await this.instance
      .get<AdsResearchResponse>('', { params: filters })
      .then((res) => res.data);
  }

  public async getDetail(params: AdDetailParams): Promise<AdsResearchDetail> {
    const { id, source, ...query } = params;

    return await this.instance
      .get<AdsResearchDetail>(`${source}/${id}`, { params: query })
      .then((res) => res.data);
  }

  public async generateAdPack(input: AdActionInput): Promise<AdPack> {
    return await this.instance
      .post<AdPack>('ad-pack', input)
      .then((res) => res.data);
  }

  public async createRemixWorkflow(
    input: AdActionInput,
  ): Promise<AdsResearchWorkflowResult> {
    return await this.instance
      .post<AdsResearchWorkflowResult>('remix-workflow', input)
      .then((res) => res.data);
  }

  public async prepareCampaignForReview(
    input: AdActionInput & {
      campaignName?: string;
      createWorkflow?: boolean;
      dailyBudget?: number;
    },
  ): Promise<CampaignLaunchPrep> {
    return await this.instance
      .post<CampaignLaunchPrep>('launch-prep', input)
      .then((res) => res.data);
  }

  public async listAdAccounts(params: {
    platform: AdsResearchPlatform;
    credentialId: string;
    loginCustomerId?: string;
  }): Promise<UnifiedAdAccountOption[]> {
    return await this.instance
      .get<UnifiedAdAccountOption[]>(
        `${EnvironmentService.apiEndpoint}/ads/${params.platform}/accounts`,
        {
          params: {
            credentialId: params.credentialId,
            loginCustomerId: params.loginCustomerId,
          },
        },
      )
      .then((res) => res.data);
  }
}
