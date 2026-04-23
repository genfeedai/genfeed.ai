import type { ApiKey } from '@api/collections/api-keys/schemas/api-key.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class ApiKeyEntity extends BaseEntity implements ApiKey {
  id!: string;
  mongoId!: string | null;
  userId!: string;
  organizationId!: string;
  key!: string;
  label!: string;
  category!: ApiKey['category'];
  description!: string | null;
  keyFingerprint!: string | null;
  user!: string;
  organization!: string;
  scopes!: string[];
  lastUsedAt!: Date | null;
  lastUsedIp!: string | null;
  expiresAt!: Date | null;
  isRevoked!: boolean;
  revokedAt!: Date | null;
  usageCount!: number;
  rateLimit!: number | null;
  allowedIps!: string[];
  metadata!: ApiKey['metadata'];
}
