import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/interfaces';
import { HarnessProfile } from '@genfeedai/models/ai/harness-profile.model';
import { HarnessProfileSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';

export class HarnessProfilesService extends BaseService<HarnessProfile> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.HARNESS_PROFILES,
      token,
      HarnessProfile,
      HarnessProfileSerializer,
    );
  }

  public static getInstance(token: string): HarnessProfilesService {
    return BaseService.getDataServiceInstance(HarnessProfilesService, token);
  }

  public async findForBrand(brandId: string): Promise<HarnessProfile[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('', { params: { brandId } })
      .then((res) => this.mapMany(res.data));
  }

  public async createForBrand(
    data: ICreateHarnessProfilePayload,
  ): Promise<HarnessProfile> {
    return await this.instance
      .post<JsonApiResponseDocument>('', data)
      .then((res) => this.mapOne(res.data));
  }

  public async updateProfile(
    id: string,
    data: Partial<IHarnessProfile>,
  ): Promise<HarnessProfile> {
    return await this.instance
      .patch<JsonApiResponseDocument>(`/${id}`, data)
      .then((res) => this.mapOne(res.data));
  }
}
