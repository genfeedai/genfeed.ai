export interface ActivityChartProps {
  data: { date: string; posts: number }[];
  isLoading: boolean;
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
