/**
 * Analytics Feedback Node Types
 *
 * Reads aggregated performance data and outputs signals that downstream
 * nodes can use to steer content toward what works and away from what doesn't.
 */

export interface AnalyticsFeedbackNodeData {
  label: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  topN: number;
  worstN: number;
  brandId: string | null;
}

export const DEFAULT_ANALYTICS_FEEDBACK_DATA: Partial<AnalyticsFeedbackNodeData> =
  {
    brandId: null,
    label: 'Analytics Feedback',
    status: 'idle',
    topN: 5,
    worstN: 5,
  };
