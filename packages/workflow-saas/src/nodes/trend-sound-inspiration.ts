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

export const trendSoundInspirationNodeDefinition = {
  category: 'inspiration' as const,
  defaultData: DEFAULT_TREND_SOUND_INSPIRATION_DATA,
  description: 'Get trending TikTok sound for content',
  icon: 'Music',
  inputs: [],
  label: 'Trend Sound Inspiration',
  outputs: [
    { id: 'soundId', label: 'Sound ID', type: 'text' },
    { id: 'soundName', label: 'Sound Name', type: 'text' },
    { id: 'soundUrl', label: 'Sound URL', type: 'text' },
    { id: 'duration', label: 'Duration (s)', type: 'number' },
    { id: 'usageCount', label: 'Usage Count', type: 'number' },
  ],
  type: 'trendSoundInspiration',
};
