import type { IApiKey, IApiKeyAttributes } from '@genfeedai/interfaces/core/api-key.interface';
import { del, get, post } from './client';
import {
  extractPagination,
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

// Backend caps `limit` at 100 (BaseQueryDto @Max(100)); request full pages.
const API_KEYS_PAGE_SIZE = 100;
// Hard stop so a misbehaving pagination contract can never loop forever.
const API_KEYS_MAX_PAGES = 1000;

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
  const keys: ApiKey[] = [];

  for (let page = 1; page <= API_KEYS_MAX_PAGES; page += 1) {
    const response = await get<JsonApiCollectionResponse>(
      `/api-keys?limit=${API_KEYS_PAGE_SIZE}&page=${page}`
    );
    keys.push(...flattenCollection<ApiKey>(response));

    const pagination = extractPagination(response);
    // No pagination block (non-paginated response) or we've reached the last
    // page — stop. Guards against page counts of 0 for empty result sets.
    if (!pagination || page >= pagination.pages) {
      break;
    }
  }

  return keys;
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
