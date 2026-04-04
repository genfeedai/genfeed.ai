import { IBaseEntity } from '../index';

export interface IApiKey extends IBaseEntity {
  label: string;
  description?: string;

  scopes: string[];
  lastUsedAt?: string;
  lastUsedIp?: string;
  expiresAt?: string;
  isRevoked: boolean;
  revokedAt?: string;
  usageCount: number;
  rateLimit?: number;
}
