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

export const analyticsFeedbackNodeDefinition = {
  category: 'trigger' as const,
  defaultData: DEFAULT_ANALYTICS_FEEDBACK_DATA,
  description: 'Read performance analytics to guide content strategy',
  icon: 'BarChart3',
  inputs: [],
  label: 'Analytics Feedback',
  outputs: [
    { id: 'topTopics', label: 'Top Topics', type: 'text[]' },
    { id: 'topHooks', label: 'Top Hooks', type: 'text[]' },
    { id: 'worstTopics', label: 'Worst Topics', type: 'text[]' },
    { id: 'bestPlatform', label: 'Best Platform', type: 'text' },
    { id: 'avgEngagementRate', label: 'Avg Engagement Rate', type: 'number' },
    {
      id: 'weekOverWeekDirection',
      label: 'Week-over-Week Direction',
      type: 'text',
    },
    {
      id: 'weekOverWeekChange',
      label: 'Week-over-Week Change %',
      type: 'number',
    },
    { id: 'bestPostingTimes', label: 'Best Posting Times', type: 'json' },
  ],
  type: 'analyticsFeedback',
};
