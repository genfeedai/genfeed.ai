export interface Analytics {
  views: number;
  engagement: number;
  averageWatchTime: number;
  shares: number;
  likes: number;
  comments: number;
  timeRange?: string;
  videoId?: string;
}

export interface TopPerformingVideo {
  id: string;
  title: string;
  views: number;
  engagement: number;
}

export interface OrganizationAnalytics {
  totalVideos: number;
  totalViews: number;
  totalEngagement: number;
  averageVideoLength: number;
  topPerformingVideos: TopPerformingVideo[];
  growthRate: number;
  activeUsers: number;
}
