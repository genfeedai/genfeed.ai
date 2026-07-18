import type {
  CreateApiKeySchema,
  UpdateApiKeySchema,
} from '@genfeedai/client/schemas/management/api-key.schema';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ApiKeyCategory } from '@genfeedai/enums';
import type {
  ConnectGenfeedVerificationResult,
  VerifyConnectGenfeedPayload,
} from '@genfeedai/interfaces';
import { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { ApiKeySerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export type CreateApiKeyPayload = Omit<CreateApiKeySchema, 'category'> & {
  category?: ApiKeyCategory | string;
};

export type UpdateApiKeyPayload = UpdateApiKeySchema;

export class ConnectGenfeedRequestError extends Error {
  constructor(readonly status: number) {
    super('Connect Genfeed verification request failed');
    this.name = 'ConnectGenfeedRequestError';
  }
}

export class ApiKeysService extends BaseService<
  ApiKey,
  CreateApiKeyPayload,
  UpdateApiKeyPayload
> {
  constructor(token: string) {
    super(API_ENDPOINTS.API_KEYS, token, ApiKey, ApiKeySerializer);
  }

  public static getInstance(token: string): ApiKeysService {
    return BaseService.getDataServiceInstance(ApiKeysService, token);
  }

  public async createApiKey(payload: CreateApiKeyPayload): Promise<ApiKey> {
    return await this.post({
      ...payload,
      category: ApiKeyCategory.GENFEEDAI,
    });
  }

  public async rotateApiKey(id: string): Promise<ApiKey> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/${id}/rotate`)
      .then((res) => res.data)
      .then(async (res) => await this.mapOne(res));
  }

  public async revokeApiKey(id: string): Promise<ApiKey> {
    return await this.delete(id);
  }

  public async verifyMcpConnection(
    id: string,
    payload: VerifyConnectGenfeedPayload,
  ): Promise<ConnectGenfeedVerificationResult> {
    // This request carries a copy-once API key. Keep it out of the shared
    // Axios interceptor, whose development diagnostics retain request bodies.
    const response = await fetch(`${this.baseURL}/${id}/verify-mcp`, {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new ConnectGenfeedRequestError(response.status);
    }

    return (await response.json()) as ConnectGenfeedVerificationResult;
  }
}
