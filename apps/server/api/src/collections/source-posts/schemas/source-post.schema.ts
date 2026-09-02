import type { SocialSourcePlatform } from '@genfeedai/contracts';
import type { SourcePostMetrics } from '@genfeedai/contracts/interfaces';

export interface SourcePostDocument {
  id: string;
  organizationId: string;
  brandId: string;
  userId?: string | null;
  sourceId: string;
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
  metrics?: SourcePostMetrics | null;
  hashtags?: string[];
  publishedAt?: Date | string | null;
  collectedAt?: Date | string | null;
  raw?: Record<string, unknown> | null;
  isDeleted?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: unknown;
}
