import type {
  ICredential,
  ICredentialOAuth,
} from '@genfeedai/contracts/interfaces';
import {
  Credential,
  CredentialOAuth,
} from '@genfeedai/models/auth/credential.model';
import { CredentialOAuthSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface OAuthConnectReadinessResponse {
  status: 'available' | 'unavailable';
}

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

  public async getConnectReadiness(): Promise<OAuthConnectReadinessResponse> {
    return await this.instance
      .get<OAuthConnectReadinessResponse>('connect-readiness')
      .then((res) => res.data);
  }

  public async postConnect(body: unknown): Promise<ICredentialOAuth> {
    return await this.instance
      .post<JsonApiResponseDocument>(`connect`, body)
      .then((res) => res.data)
      .then(
        (res) =>
          new CredentialOAuth(
            this.extractResource<Partial<ICredentialOAuth>>(res),
          ),
      );
  }

  public async postVerify(body: unknown): Promise<ICredential> {
    return await this.instance
      .post<JsonApiResponseDocument>(`verify`, body)
      .then((res) => res.data)
      .then(
        (res) =>
          new Credential(this.extractResource<Partial<ICredential>>(res)),
      );
  }

  public async refreshAuthorizedSignals(
    credentialId: string,
  ): Promise<ICredential> {
    return await this.instance
      .post<JsonApiResponseDocument>(
        `${credentialId}/authorized-signals/refresh`,
      )
      .then((res) => res.data)
      .then(
        (res) =>
          new Credential(this.extractResource<Partial<ICredential>>(res)),
      );
  }
}
