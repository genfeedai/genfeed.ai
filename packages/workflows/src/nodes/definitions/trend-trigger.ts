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
