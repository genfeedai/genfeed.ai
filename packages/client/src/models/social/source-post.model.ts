import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { SocialSourcePlatform } from '@genfeedai/contracts';
import type {
  ISourcePost,
  SourcePostMetrics,
} from '@genfeedai/contracts/interfaces';

export class SourcePost extends BaseEntity implements ISourcePost {
  declare public organizationId: string;
  declare public brandId: string;
  declare public userId?: string | null;
  declare public sourceId: string;
  declare public platform: SocialSourcePlatform | string;
  declare public externalId: string;
  declare public contentType: string;
  declare public text?: string | null;
  declare public authorId?: string | null;
  declare public authorHandle?: string | null;
  declare public authorDisplayName?: string | null;
  declare public authorAvatarUrl?: string | null;
  declare public authorFollowersCount?: number | null;
  declare public sourceUrl?: string | null;
  declare public mediaUrls?: string[];
  declare public thumbnailUrl?: string | null;
  declare public metrics?: SourcePostMetrics;
  declare public hashtags?: string[];
  declare public publishedAt?: string | null;
  declare public collectedAt?: string | null;
  declare public raw?: Record<string, unknown>;

  constructor(data: Partial<ISourcePost> = {}) {
    super(data);
  }
}
