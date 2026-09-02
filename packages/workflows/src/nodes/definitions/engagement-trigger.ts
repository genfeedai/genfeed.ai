/**
 * Engagement Trigger Node Types
 *
 * This node starts a workflow when engagement metrics (likes, comments,
 * shares, views) on monitored posts hit a configured threshold.
 */

import type { BaseNodeData } from '../types';

export type EngagementTriggerPlatform = 'twitter' | 'instagram' | 'threads';

export type EngagementMetricType = 'likes' | 'comments' | 'shares' | 'views';

export interface EngagementTriggerNodeData extends BaseNodeData {
  type: 'engagementTrigger';

  /** Platform to monitor */
  platform: EngagementTriggerPlatform;
  /** Post IDs to monitor */
  postIds: string[];
  /** Metric type to watch */
  metricType: EngagementMetricType;
  /** Threshold value to trigger on */
  threshold: number;

  /** Last checked post ID (for deduplication) */
  lastCheckedPostId: string | null;
  /** Last triggered timestamp (for display) */
  lastTriggeredAt: string | null;
  /** Last metric value when triggered (for display) */
  lastMetricValue: number | null;
}

export const DEFAULT_ENGAGEMENT_TRIGGER_DATA: Partial<EngagementTriggerNodeData> =
  {
    label: 'Engagement Trigger',
    lastCheckedPostId: null,
    lastMetricValue: null,
    lastTriggeredAt: null,
    metricType: 'likes',
    platform: 'twitter',
    postIds: [],
    status: 'idle',
    threshold: 100,
    type: 'engagementTrigger',
  };
