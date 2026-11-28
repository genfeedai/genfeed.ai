import { Platform } from '@genfeedai/contracts';

/** Platforms whose creators the outlier library tracks. */
export const OUTLIER_LIBRARY_PLATFORMS = [
  Platform.YOUTUBE,
  Platform.INSTAGRAM,
  Platform.TIKTOK,
] as const;

export type OutlierLibraryPlatform = (typeof OUTLIER_LIBRARY_PLATFORMS)[number];

/** `removed` is a creator's removal request: never listed, never read again. */
export const OUTLIER_CREATOR_STATUSES = [
  'active',
  'unreadable',
  'removed',
] as const;

export type OutlierCreatorStatus = (typeof OUTLIER_CREATOR_STATUSES)[number];

export type OutlierLibraryTier = 'outlier' | 'breakout';

/** A creator to track, from a trend refresh, a niche scan or a niche seed list. */
export interface OutlierLibraryCreatorInput {
  platform: OutlierLibraryPlatform;
  externalId: string;
  handle: string;
  displayName?: string | null;
  followersCount?: number | null;
  nicheTags?: readonly string[];
}

/** One post read from a creator, before its multiple is known. */
export interface OutlierLibraryPostInput {
  externalId: string;
  url: string;
  publishedAt: Date;
  /** `null` when the platform returned no views for this post. */
  views: number | null;
  likes?: number | null;
  comments?: number | null;
  isPinned?: boolean | null;
  /** `null` is unknown, as Instagram Business Discovery returns it. */
  isPromoted?: boolean | null;
  soundId?: string | null;
  hashtags?: readonly string[];
  caption?: string | null;
  format?: string | null;
}

export interface OutlierLibraryReadResult {
  creatorId: string;
  status: 'ready' | 'insufficient_data' | 'zero_baseline';
  medianViews: number | null;
  sampleSize: number;
  /** Posts listed after this read. */
  listedCount: number;
}

export interface OutlierLibraryListQuery {
  platform?: OutlierLibraryPlatform;
  tier?: OutlierLibraryTier;
  limit?: number;
  offset?: number;
}

/** A listed post with its creator, as a list read returns it. */
export interface OutlierLibraryPostRecord {
  id: string;
  platform: OutlierLibraryPlatform;
  externalId: string;
  url: string;
  publishedAt: Date;
  views: number;
  likes: number | null;
  comments: number | null;
  countsReadAt: Date;
  medianViews: number;
  sampleSize: number;
  outlierRatio: number;
  outlierTier: OutlierLibraryTier;
  soundId: string | null;
  hashtags: string[];
  captionExcerpt: string | null;
  format: string | null;
  creator: {
    id: string;
    handle: string;
    displayName: string | null;
    followersCount: number | null;
  };
}
