import type { TrendTimelineEntry } from '@services/social/trends.service';

export interface TrendFlowChartProps {
  data: TrendTimelineEntry[];
  isLoading?: boolean;
}
