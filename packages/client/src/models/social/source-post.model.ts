import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { SocialSourcePlatform } from '@genfeedai/enums';
import type { ISourcePost, SourcePostMetrics } from '@genfeedai/interfaces';

export class SourcePost extends BaseEntity implements ISourcePost {
  public declare organization?: ISourcePost['organization'];
  public declare organizationId?: string;
  public declare brand?: ISourcePost['brand'];
  public declare brandId?: string;
  public declare user?: ISourcePost['user'];
  public declare userId?: string | null;
  public declare source?: ISourcePost['source'];
  public declare sourceId?: string;
  public declare platform: SocialSourcePlatform | string;
  public declare externalId: string;
  public declare contentType: string;
  public declare text?: string | null;
  public declare authorId?: string | null;
  public declare authorHandle?: string | null;
  public declare authorDisplayName?: string | null;
  public declare authorAvatarUrl?: string | null;
  public declare authorFollowersCount?: number | null;
  public declare sourceUrl?: string | null;
  public declare mediaUrls?: string[];
  public declare thumbnailUrl?: string | null;
  public declare metrics?: SourcePostMetrics;
  public declare hashtags?: string[];
  public declare publishedAt?: string | null;
  public declare collectedAt?: string | null;
  public declare raw?: Record<string, unknown>;

  constructor(data: Partial<ISourcePost> = {}) {
    super(data);
  }
}
