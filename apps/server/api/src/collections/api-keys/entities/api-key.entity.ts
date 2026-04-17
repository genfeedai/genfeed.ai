import type { ApiKey } from '@api/collections/api-keys/schemas/api-key.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { ApiKeyCategory } from '@genfeedai/enums';

export class ApiKeyEntity extends BaseEntity implements ApiKey {
  key!: string;
  label!: string;
  category!: ApiKeyCategory;
  description?: string;
  user!: string;
  organization!: string;
  scopes!: string[];
  lastUsedAt?: Date;
  lastUsedIp?: string;
  expiresAt?: Date;
  isRevoked!: boolean;
  revokedAt?: Date;
  usageCount!: number;
  rateLimit?: number;
  allowedIps?: string[];
  metadata?: Record<string, unknown>;
}
