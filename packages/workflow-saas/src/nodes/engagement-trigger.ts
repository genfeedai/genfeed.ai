/**
 * Engagement Trigger Node Types
 *
 * This node starts a workflow when engagement metrics (likes, comments,
 * shares, views) on monitored posts hit a configured threshold.
 */

import type { BaseNodeData } from '@workflow-saas/types';

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

export const engagementTriggerNodeDefinition = {
  category: 'trigger' as const,
  defaultData: DEFAULT_ENGAGEMENT_TRIGGER_DATA,
  description: 'Start workflow when engagement metrics hit a threshold',
  icon: 'BarChart2',
  inputs: [],
  label: 'Engagement Trigger',
  outputs: [
    { id: 'postId', label: 'Post ID', type: 'text' },
    { id: 'postUrl', label: 'Post URL', type: 'text' },
    { id: 'metricType', label: 'Metric Type', type: 'text' },
    { id: 'currentValue', label: 'Current Value', type: 'number' },
    { id: 'threshold', label: 'Threshold', type: 'number' },
    { id: 'platform', label: 'Platform', type: 'text' },
  ],
  type: 'engagementTrigger',
};
