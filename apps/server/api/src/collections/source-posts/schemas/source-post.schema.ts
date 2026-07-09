import type { SocialSourcePlatform } from '@genfeedai/enums';
import type { SourcePostMetrics } from '@genfeedai/interfaces';

export interface SourcePostDocument {
  id: string;
  _id?: string;
  mongoId?: string | null;
  organizationId: string;
  organization?: string | { id?: string } | null;
  brandId: string;
  brand?: string | { id?: string } | null;
  userId?: string | null;
  user?: string | { id?: string } | null;
  sourceId: string;
  source?: string | { id?: string } | null;
  platform: SocialSourcePlatform | string;
  externalId: string;
  contentType: string;
  text?: string | null;
  authorId?: string | null;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  authorFollowersCount?: number | null;
  sourceUrl?: string | null;
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  metrics?: SourcePostMetrics;
  hashtags?: string[];
  publishedAt?: Date | string | null;
  collectedAt?: Date | string | null;
  raw?: Record<string, unknown>;
  isDeleted?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: unknown;
}
