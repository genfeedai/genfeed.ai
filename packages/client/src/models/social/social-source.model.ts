import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  SocialSourcePlatform,
  SocialSourceType,
} from '@genfeedai/contracts';
import type { ISocialSource } from '@genfeedai/contracts/interfaces';

export class SocialSource extends BaseEntity implements ISocialSource {
  declare public organizationId: string;
  declare public brandId: string;
  declare public userId: string;
  declare public credentialId?: string | null;
  declare public platform: SocialSourcePlatform | string;
  declare public sourceType: SocialSourceType | string;
  declare public externalId?: string | null;
  declare public handle: string;
  declare public displayName?: string | null;
  declare public avatarUrl?: string | null;
  declare public profileUrl?: string | null;
  declare public bio?: string | null;
  declare public followersCount?: number | null;
  declare public isActive: boolean;
  declare public lastSyncedAt?: string | null;
  declare public lastSyncStatus?: string | null;
  declare public lastSyncError?: string | null;
  declare public lastPostExternalId?: string | null;
  declare public metadata?: Record<string, unknown>;

  constructor(data: Partial<ISocialSource> = {}) {
    super(data);
  }
}
