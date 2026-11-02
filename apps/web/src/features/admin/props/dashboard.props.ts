import type {
  AdminActivityRange,
  ITimeSeriesDataPoint,
} from '@/hooks/data/analytics/use-admin-stats/use-admin-stats';

export interface ActivityChartProps {
  data: ITimeSeriesDataPoint[];
  isLoading: boolean;
  onRangeChange: (range: AdminActivityRange) => void;
  range: AdminActivityRange;
}

export interface LeaderboardCardProps {
  data: {
    rank: number;
    organization: { id: string; name: string; logo?: string };
    totalPosts: number;
    growth: number;
  }[];
  isLoading: boolean;
}

export interface StatsGridProps {
  stats: {
    totalBrands: number;
    pendingPosts: number;
    activeWorkflows: number;
    activeBots: number;
    totalModels: number;
    recentActivities: number;
  };
  isLoading: boolean;
}
