/**
 * Trend Sound Inspiration Node Types
 *
 * This node gets trending sounds from TikTok for content creation.
 * Auto-selects top trending sounds based on usage count and growth rate.
 */

import type { BaseTrendNodeData } from './trend-shared';

export interface TrendSoundInspirationNodeData extends BaseTrendNodeData {
  // Configuration
  minUsageCount: number;
  maxDuration: number | null;

  // Outputs
  soundId: string | null;
  soundName: string | null;
  soundUrl: string | null;
  duration: number | null;
  usageCount: number | null;

  // Additional info (for display)
  authorName: string | null;
  coverUrl: string | null;
  growthRate: number | null;
}

export const DEFAULT_TREND_SOUND_INSPIRATION_DATA: Partial<TrendSoundInspirationNodeData> =
  {
    authorName: null,
    coverUrl: null,
    duration: null,
    growthRate: null,
    label: 'Trend Sound Inspiration',
    maxDuration: null,
    minUsageCount: 10000,
    soundId: null,
    soundName: null,
    soundUrl: null,
    status: 'idle',
    usageCount: null,
  };
