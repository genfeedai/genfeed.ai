import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  AccountHealthSummary,
  AccountPublishingContext,
  AssessAccountHealthRequest,
  ContentSurface,
  IClockTime,
  ICredentialPostingTimes,
  INextPostingSlot,
  IPublishingProviderReadiness,
  ManualAccountHealthOverrideRequest,
} from '@genfeedai/contracts/interfaces';
import type { QuotaStatus } from '@genfeedai/contracts/interfaces/organization/quota-status.interface';
import {
  Credential,
  CredentialInstagram,
} from '@genfeedai/models/auth/credential.model';
import { CredentialSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class CredentialsService extends BaseService<Credential> {
  constructor(token: string) {
    super(API_ENDPOINTS.CREDENTIALS, token, Credential, CredentialSerializer);
  }

  public static getInstance(token: string): CredentialsService {
    return BaseService.getDataServiceInstance(CredentialsService, token);
  }

  public async findCredentialInstagramPages(
    id: string,
    signal?: AbortSignal,
  ): Promise<CredentialInstagram[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/instagram/pages`, { signal })
      .then((res) =>
        this.extractCollection<Partial<CredentialInstagram>>(res.data).map(
          (item) => new CredentialInstagram(item),
        ),
      );
  }

  public async refreshCredential(credentialId: string): Promise<Credential> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/${credentialId}/refresh`)
      .then((res) => {
        const data = this.extractResource<Partial<Credential>>(res.data);
        return new Credential(data);
      });
  }

  public async listBrandAccountHealth(
    brandId: string,
  ): Promise<AccountHealthSummary[]> {
    const response = await this.instance.get<AccountHealthSummary[]>(
      `/brand/${brandId}/account-health`,
    );
    return response.data;
  }

  /**
   * Publishing readiness for every connected channel of a brand. Selection
   * surfaces need the whole set before the user picks anything, so this is one
   * request rather than one per channel.
   */
  public async listBrandPublishingReadiness(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IPublishingProviderReadiness[]> {
    const response = await this.instance.get<IPublishingProviderReadiness[]>(
      `/brand/${brandId}/publishing-readiness`,
      { signal },
    );
    return response.data;
  }

  public async getPublishingContext(
    credentialId: string,
    surface: ContentSurface = 'post',
    signal?: AbortSignal,
  ): Promise<AccountPublishingContext> {
    const response = await this.instance.get<AccountPublishingContext>(
      `/${credentialId}/publishing-context`,
      {
        params: { surface },
        signal,
      },
    );
    return response.data;
  }

  public async assessAccountHealth(
    credentialId: string,
    data: AssessAccountHealthRequest = {},
  ): Promise<AccountHealthSummary> {
    const response = await this.instance.post<AccountHealthSummary>(
      `/${credentialId}/account-health/assess`,
      data,
    );
    return response.data;
  }

  public async overrideAccountHealth(
    credentialId: string,
    data: ManualAccountHealthOverrideRequest,
  ): Promise<AccountHealthSummary> {
    const response = await this.instance.patch<AccountHealthSummary>(
      `/${credentialId}/account-health/override`,
      data,
    );
    return response.data;
  }

  public async listPostingTimes(
    credentialId: string,
    signal?: AbortSignal,
  ): Promise<IClockTime[]> {
    const response = await this.instance.get<ICredentialPostingTimes>(
      `/${credentialId}/posting-times`,
      { signal },
    );
    return response.data.times;
  }

  public async addPostingTime(
    credentialId: string,
    time: IClockTime,
  ): Promise<IClockTime[]> {
    const response = await this.instance.post<ICredentialPostingTimes>(
      `/${credentialId}/posting-times`,
      time,
    );
    return response.data.times;
  }

  public async removePostingTime(
    credentialId: string,
    time: IClockTime,
  ): Promise<IClockTime[]> {
    const response = await this.instance.delete<ICredentialPostingTimes>(
      `/${credentialId}/posting-times`,
      { data: time },
    );
    return response.data.times;
  }

  public async replacePostingTimes(
    credentialId: string,
    times: IClockTime[],
  ): Promise<IClockTime[]> {
    const response = await this.instance.put<ICredentialPostingTimes>(
      `/${credentialId}/posting-times`,
      { times },
    );
    return response.data.times;
  }

  public async findNextSlot(
    credentialId: string,
    after?: string,
    signal?: AbortSignal,
  ): Promise<INextPostingSlot> {
    const response = await this.instance.get<INextPostingSlot>(
      `/${credentialId}/next-slot`,
      {
        params: after ? { after } : undefined,
        signal,
      },
    );
    return response.data;
  }

  public async getQuotaStatus(credentialId: string): Promise<QuotaStatus> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${credentialId}/quota`)
      .then((res) => {
        const data = this.extractResource<QuotaStatus>(res.data);
        return data as QuotaStatus;
      });
  }
}
