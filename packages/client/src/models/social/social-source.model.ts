import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { SocialSourcePlatform, SocialSourceType } from '@genfeedai/enums';
import type { ISocialSource } from '@genfeedai/interfaces';

export class SocialSource extends BaseEntity implements ISocialSource {
  public declare organization?: ISocialSource['organization'];
  public declare organizationId?: string;
  public declare brand?: ISocialSource['brand'];
  public declare brandId?: string;
  public declare user?: ISocialSource['user'];
  public declare userId?: string;
  public declare credential?: ISocialSource['credential'];
  public declare credentialId?: string | null;
  public declare platform: SocialSourcePlatform | string;
  public declare sourceType: SocialSourceType | string;
  public declare externalId?: string | null;
  public declare handle: string;
  public declare displayName?: string | null;
  public declare avatarUrl?: string | null;
  public declare profileUrl?: string | null;
  public declare bio?: string | null;
  public declare followersCount?: number | null;
  public declare isActive: boolean;
  public declare lastSyncedAt?: string | null;
  public declare lastSyncStatus?: string | null;
  public declare lastSyncError?: string | null;
  public declare lastPostExternalId?: string | null;
  public declare metadata?: Record<string, unknown>;

  constructor(data: Partial<ISocialSource> = {}) {
    super(data);
  }
}
