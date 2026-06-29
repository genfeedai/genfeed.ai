import type { IBaseEntity } from '../index';

export interface IApiKey extends IBaseEntity {
  allowedIps?: string[];
  category?: string;
  label: string;
  description?: string;
  key?: string;
  token?: string;

  scopes: string[];
  lastUsedAt?: string;
  lastUsedIp?: string;
  expiresAt?: string;
  isRevoked: boolean;
  revokedAt?: string;
  usageCount: number;
  rateLimit?: number;
  metadata?: Record<string, unknown>;
}
