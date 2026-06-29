import type { IApiKey, IApiKeyAttributes } from '@genfeedai/interfaces';
import { del, get, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export type ApiKey = IApiKey;

type CreateApiKeyFields = Pick<
  IApiKeyAttributes,
  'allowedIps' | 'description' | 'label' | 'metadata' | 'rateLimit' | 'scopes'
>;

export type CreateApiKeyInput = Omit<CreateApiKeyFields, 'label'> & {
  expiresAt?: string;
  label: string;
};

export async function listApiKeys(): Promise<ApiKey[]> {
  const response = await get<JsonApiCollectionResponse>('/api-keys?limit=100');
  return flattenCollection<ApiKey>(response);
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
  const response = await post<JsonApiSingleResponse>('/api-keys', {
    ...input,
    category: 'genfeedai',
  });
  return flattenSingle<ApiKey>(response);
}

export async function revokeApiKey(id: string): Promise<ApiKey> {
  const response = await del<JsonApiSingleResponse>(`/api-keys/${id}`);
  return flattenSingle<ApiKey>(response);
}

export async function rotateApiKey(id: string): Promise<ApiKey> {
  const response = await post<JsonApiSingleResponse>(`/api-keys/${id}/rotate`);
  return flattenSingle<ApiKey>(response);
}
