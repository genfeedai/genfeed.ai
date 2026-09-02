/**
 * Trend Hashtag Inspiration Node Types
 *
 * This node generates content ideas from trending hashtags.
 * Uses AI to analyze hashtag context and create suitable content prompts.
 */

import type {
  BaseTrendNodeData,
  ContentPreference,
  ContentType,
  TrendPlatform,
} from './trend-shared';

export interface TrendHashtagInspirationNodeData extends BaseTrendNodeData {
  // Inputs (can be connected or auto-selected)
  hashtag: string | null;
  auto: boolean;

  // Configuration
  platform: TrendPlatform;
  contentPreference: ContentPreference;

  // Outputs
  prompt: string | null;
  hashtags: string[];
  contentType: ContentType | null;
  recommendedPlatform: TrendPlatform | null;

  // Source hashtag info (for display)
  sourceHashtag: string | null;
  hashtagPostCount: number | null;
}

export const DEFAULT_TREND_HASHTAG_INSPIRATION_DATA: Partial<TrendHashtagInspirationNodeData> =
  {
    auto: true,
    contentPreference: 'video',
    contentType: null,
    hashtag: null,
    hashtagPostCount: null,
    hashtags: [],
    label: 'Trend Hashtag Inspiration',
    platform: 'tiktok',
    prompt: null,
    recommendedPlatform: null,
    sourceHashtag: null,
    status: 'idle',
  };
