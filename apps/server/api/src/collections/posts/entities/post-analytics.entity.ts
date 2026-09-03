import { type PostAnalytics } from '@genfeedai/prisma';

export class PostAnalyticsEntity implements PostAnalytics {
  declare readonly id: string;
  declare readonly postId: string;
  declare readonly userId: string;
  declare readonly brandId: string;
  declare readonly organizationId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  declare readonly ingredients?: string[];

  declare readonly platform: PostAnalytics['platform'];
  declare readonly date: Date;

  declare readonly totalViews: number;
  declare readonly totalLikes: number;
  declare readonly totalComments: number;
  declare readonly totalShares: number;
  declare readonly totalSaves: number;

  declare readonly totalViewsIncrement: number;
  declare readonly totalLikesIncrement: number;
  declare readonly totalCommentsIncrement: number;
  declare readonly totalSharesIncrement: number;
  declare readonly totalSavesIncrement: number;

  declare readonly engagementRate: number;
  declare readonly credentialId: string | null;
  declare readonly impressions: number | null;
  declare readonly reach: number | null;
  declare readonly clicks: number | null;
  declare readonly videoViews: number | null;
  declare readonly watchTimeSeconds: number | null;
  declare readonly averageWatchTimeSeconds: number | null;
  declare readonly metricAvailability: PostAnalytics['metricAvailability'];
  declare readonly correctionKind: string | null;

  constructor(partial: Partial<PostAnalytics>) {
    Object.assign(this, partial);
  }
}
