import type { IBaseEntity } from './base.interface';

type ApiKeyDateValue = Date | string | null;

export interface IApiKeyAttributes {
  allowedIps?: string[];
  category?: string;
  label?: string;
  name?: string;
  description?: string;
  key?: string;
  token?: string;

  scopes?: string[];
  lastUsedAt?: ApiKeyDateValue;
  lastUsedIp?: string;
  expiresAt?: ApiKeyDateValue;
  createdAt?: ApiKeyDateValue;
  updatedAt?: ApiKeyDateValue;
  isActive?: boolean;
  isRevoked?: boolean;
  revokedAt?: ApiKeyDateValue;
  usageCount?: number;
  rateLimit?: number;
  metadata?: Record<string, unknown>;
}

export interface IApiKey
  extends IApiKeyAttributes,
    Partial<Omit<IBaseEntity, 'createdAt' | 'updatedAt'>> {
  id: string;
  type?: string;
  attributes?: IApiKeyAttributes;
  createdAt?: ApiKeyDateValue;
  updatedAt?: ApiKeyDateValue;
}
