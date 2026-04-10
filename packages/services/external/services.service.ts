import type { ICredential, ICredentialOAuth } from '@genfeedai/interfaces';
import {
  Credential,
  CredentialOAuth,
} from '@genfeedai/models/auth/credential.model';
import {
  CredentialOAuthSerializer,
  ServiceSerializer,
} from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class ServicesService extends BaseService<CredentialOAuth | Credential> {
  constructor(platform: string, token: string) {
    // Pass platform-specific endpoint (e.g., '/services/twitter', '/services/instagram')
    super(
      `/services/${platform}`,
      token,
      CredentialOAuth,
      CredentialOAuthSerializer,
    );
  }

  // Note: getInstance pattern doesn't apply here due to platform parameter in constructor

  public async postConnect(body: unknown): Promise<ICredentialOAuth> {
    const data = ServiceSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>(`connect`, data)
      .then((res) => res.data)
      .then(
        (res) =>
          new CredentialOAuth(
            this.extractResource<Partial<ICredentialOAuth>>(res),
          ),
      );
  }

  public async postVerify(body: unknown): Promise<ICredential> {
    const data = ServiceSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>(`verify`, data)
      .then((res) => res.data)
      .then(
        (res) =>
          new Credential(this.extractResource<Partial<ICredential>>(res)),
      );
  }
}
