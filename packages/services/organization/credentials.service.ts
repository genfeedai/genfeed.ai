import type { QuotaStatus } from '@cloud/interfaces/organization/quota-status.interface';
import { CredentialSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { Credential, CredentialInstagram } from '@models/auth/credential.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class CredentialsService extends BaseService<Credential> {
  constructor(token: string) {
    super(API_ENDPOINTS.CREDENTIALS, token, Credential, CredentialSerializer);
  }

  public static getInstance(token: string): CredentialsService {
    return BaseService.getDataServiceInstance(
      CredentialsService,
      token,
    ) as CredentialsService;
  }

  public async findCredentialInstagramPages(
    id: string,
  ): Promise<CredentialInstagram[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/instagram/pages`)
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

  public async getQuotaStatus(
    credentialId: string,
    organizationId: string,
  ): Promise<QuotaStatus> {
    return await this.instance
      .get<JsonApiResponseDocument>(
        `/${credentialId}/quota?organizationId=${organizationId}`,
      )
      .then((res) => {
        const data = this.extractResource<QuotaStatus>(res.data);
        return data as QuotaStatus;
      });
  }
}
