import type { ApiKey } from '@api/collections/api-keys/schemas/api-key.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { ApiKeyCategory } from '@genfeedai/enums';
import type { Types } from 'mongoose';

export class ApiKeyEntity extends BaseEntity implements ApiKey {
  key!: string;
  label!: string;
  category!: ApiKeyCategory;
  description?: string;
  user!: Types.ObjectId;
  organization!: Types.ObjectId;
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
