import type { TrendSourceItem } from '@api/collections/trends/interfaces/trend.interfaces';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { type Trend } from '@genfeedai/prisma';

export class TrendEntity extends BaseEntity implements Trend {
  declare readonly platform: string;
  declare readonly topic: string;
  declare readonly mentions: number;
  declare readonly growthRate: number;
  declare readonly viralityScore: number;
  declare readonly metadata: {
    hashtags?: string[];
    urls?: string[];
    sampleContent?: string;
    engagementRate?: number;
    reach?: number;
    impressions?: number;
    thumbnailUrl?: string;
    videoUrl?: string;
    creatorHandle?: string;
    trendType?: 'topic' | 'hashtag' | 'sound' | 'video' | 'creator';
    source?: 'apify' | 'curated' | 'grok' | 'native-api';
    sourcePreviewCache?: TrendSourceItem[];
    sourcePreviewCachedAt?: string;
    sourcePreviewState?: 'live' | 'fallback' | 'empty';
    [key: string]: unknown;
  };
  declare readonly organization?: string;
  declare readonly brand?: string;
  declare readonly requiresAuth: boolean;
  declare readonly expiresAt: Date;
  declare readonly isCurrent: boolean;
  declare readonly isDeleted: boolean;
}
