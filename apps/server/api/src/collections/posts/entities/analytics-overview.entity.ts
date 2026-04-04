export class AnalyticsOverviewEntity {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgEngagementRate: number;
  totalEngagement: number;
  viewsGrowth: number;
  engagementGrowth: number;
  activePlatforms: string[];
  bestPerformingPlatform: string;

  constructor(data: unknown) {
    this.totalPosts = data.totalPosts || 0;
    this.totalViews = data.totalViews || 0;
    this.totalLikes = data.totalLikes || 0;
    this.totalComments = data.totalComments || 0;
    this.totalShares = data.totalShares || 0;
    this.totalSaves = data.totalSaves || 0;
    this.avgEngagementRate = data.avgEngagementRate || 0;
    this.totalEngagement = data.totalEngagement || 0;
    this.viewsGrowth = data.viewsGrowth || 0;
    this.engagementGrowth = data.engagementGrowth || 0;
    this.activePlatforms = data.activePlatforms || [];
    this.bestPerformingPlatform = data.bestPerformingPlatform || 'N/A';
  }
}
