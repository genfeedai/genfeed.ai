import type {
  ApiKeyConnectPayload,
  ICredential,
  ICredentialOAuth,
} from '@genfeedai/contracts/interfaces';
import type { IHttpRequestOptions } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import {
  Credential,
  CredentialOAuth,
} from '@genfeedai/models/auth/credential.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import type { AxiosRequestConfig } from 'axios';

// A refused key-based connect is a 400 (a 500 when the server cannot say
// why); the form explains both in place.
const API_KEY_CONNECT_REQUEST: AxiosRequestConfig & IHttpRequestOptions = {
  handledErrorStatuses: [400, 500],
};

export interface OAuthConnectReadinessResponse {
  status: 'available' | 'unavailable';
}

export class ServicesService extends BaseService<CredentialOAuth | Credential> {
  constructor(platform: string, token: string) {
    // Pass platform-specific endpoint (e.g., '/services/twitter', '/services/instagram')
    super(`/services/${platform}`, token, CredentialOAuth);
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

  /**
   * Connect a platform that authenticates with an API key (Ghost, dev.to,
   * Beehiiv): the server verifies the key and stores the credential, no
   * redirect. A refusal is a 400 whose `code` the connect form explains, so
   * the dev-only error modal stays out of its way.
   */
  public async postConnectWithApiKey(
    body: ApiKeyConnectPayload,
  ): Promise<ICredential> {
    return await this.instance
      .post<JsonApiResponseDocument>(`connect`, body, API_KEY_CONNECT_REQUEST)
      .then((res) => res.data)
      .then(
        (res) =>
          new Credential(this.extractResource<Partial<ICredential>>(res)),
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
    signal?: AbortSignal,
  ): Promise<ICredential> {
    return await this.instance
      .post<JsonApiResponseDocument>(
        `${credentialId}/authorized-signals/refresh`,
        undefined,
        { signal },
      )
      .then((res) => res.data)
      .then(
        (res) =>
          new Credential(this.extractResource<Partial<ICredential>>(res)),
      );
  }

  /**
   * Instagram: settle a connection that needs an account choice onto every
   * account the operator ticked. The first settles this credential and each
   * further one becomes its own credential on the brand. The server checks
   * every id against the credential's own token and re-derives the profiles.
   */
  public async postSelectAccounts(
    credentialId: string,
    externalIds: string[],
  ): Promise<Credential[]> {
    return await this.instance
      .post<JsonApiResponseDocument>(`${credentialId}/select-account`, {
        externalIds,
      })
      .then((res) =>
        this.extractCollection<Partial<ICredential>>(res.data).map(
          (item) => new Credential(item),
        ),
      );
  }

  /**
   * Instagram only: settle an ambiguous connection (see
   * `needsAccountSelection`) onto one of the accounts the credential's own
   * token authorizes. The server re-derives handle/name/avatar from its own
   * list of authorized accounts and validates `externalId` against it —
   * nothing here is trusted from the request beyond which id was picked.
   */
  public async postSelectAccount(
    credentialId: string,
    externalId: string,
  ): Promise<ICredential> {
    return await this.instance
      .post<JsonApiResponseDocument>(`${credentialId}/select-account`, {
        externalId,
      })
      .then((res) => res.data)
      .then(
        (res) =>
          new Credential(this.extractResource<Partial<ICredential>>(res)),
      );
  }
}
