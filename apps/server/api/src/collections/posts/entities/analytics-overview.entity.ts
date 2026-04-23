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
    const record =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};

    this.totalPosts = this.asNumber(record.totalPosts);
    this.totalViews = this.asNumber(record.totalViews);
    this.totalLikes = this.asNumber(record.totalLikes);
    this.totalComments = this.asNumber(record.totalComments);
    this.totalShares = this.asNumber(record.totalShares);
    this.totalSaves = this.asNumber(record.totalSaves);
    this.avgEngagementRate = this.asNumber(record.avgEngagementRate);
    this.totalEngagement = this.asNumber(record.totalEngagement);
    this.viewsGrowth = this.asNumber(record.viewsGrowth);
    this.engagementGrowth = this.asNumber(record.engagementGrowth);
    this.activePlatforms = Array.isArray(record.activePlatforms)
      ? record.activePlatforms.filter(
          (platform): platform is string => typeof platform === 'string',
        )
      : [];
    this.bestPerformingPlatform =
      typeof record.bestPerformingPlatform === 'string'
        ? record.bestPerformingPlatform
        : 'N/A';
  }

  private asNumber(value: unknown): number {
    return typeof value === 'number' ? value : 0;
  }
}
