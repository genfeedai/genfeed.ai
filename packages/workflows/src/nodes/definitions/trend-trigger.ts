/**
 * Trend Trigger Node Types
 *
 * This node starts a workflow when a new trend matches the configured criteria.
 * Polls trends at configurable intervals and deduplicates to avoid re-triggering.
 */

import type {
  BaseTrendNodeData,
  CheckFrequency,
  TrendPlatform,
  TrendType,
} from './trend-shared';

export interface TrendTriggerNodeData extends BaseTrendNodeData {
  // Configuration
  platform: TrendPlatform;
  trendType: TrendType;
  minViralScore: number;
  keywords: string[];
  excludeKeywords: string[];
  checkFrequency: CheckFrequency;

  // Last trigger info (for display)
  lastTriggeredAt: string | null;
  lastTrendId: string | null;
  lastTrendTopic: string | null;
}

export const DEFAULT_TREND_TRIGGER_DATA: Partial<TrendTriggerNodeData> = {
  checkFrequency: '1hr',
  excludeKeywords: [],
  keywords: [],
  label: 'Trend Trigger',
  lastTrendId: null,
  lastTrendTopic: null,
  lastTriggeredAt: null,
  minViralScore: 70,
  platform: 'tiktok',
  status: 'idle',
  trendType: 'video',
};

export const trendTriggerNodeDefinition = {
  category: 'trigger' as const,
  defaultData: DEFAULT_TREND_TRIGGER_DATA,
  description: 'Start workflow when new trend matches criteria',
  icon: 'TrendingUp',
  inputs: [],
  label: 'Trend Trigger',
  outputs: [
    { id: 'trendId', label: 'Trend ID', type: 'text' },
    { id: 'topic', label: 'Topic', type: 'text' },
    { id: 'platform', label: 'Platform', type: 'text' },
    { id: 'viralScore', label: 'Viral Score', type: 'number' },
    { id: 'hashtags', label: 'Hashtags', type: 'text[]' },
    { id: 'videoUrl', label: 'Video URL', type: 'text' },
    { id: 'soundId', label: 'Sound ID', type: 'text' },
  ],
  type: 'trendTrigger',
};
