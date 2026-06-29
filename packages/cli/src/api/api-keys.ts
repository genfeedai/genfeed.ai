import { del, get, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export interface ApiKey {
  id: string;
  allowedIps?: string[];
  category?: string;
  createdAt?: string;
  description?: string;
  expiresAt?: string | null;
  isRevoked?: boolean;
  key?: string;
  label?: string;
  lastUsedAt?: string | null;
  lastUsedIp?: string;
  metadata?: Record<string, unknown>;
  rateLimit?: number;
  revokedAt?: string | null;
  scopes?: string[];
  token?: string;
  updatedAt?: string;
  usageCount?: number;
}

export interface CreateApiKeyInput {
  allowedIps?: string[];
  category?: string;
  description?: string;
  expiresAt?: string;
  label: string;
  metadata?: Record<string, unknown>;
  rateLimit?: number;
  scopes?: string[];
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const response = await get<JsonApiCollectionResponse>('/api-keys?limit=100');
  return flattenCollection<ApiKey>(response);
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
  const response = await post<JsonApiSingleResponse>('/api-keys', {
    category: 'genfeedai',
    ...input,
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
