import { type PostAnalytics } from '@genfeedai/prisma';

export class PostAnalyticsEntity implements PostAnalytics {
  declare readonly _id: string;
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly postId: string;
  declare readonly userId: string;
  declare readonly brandId: string;
  declare readonly organizationId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  declare readonly post: string;
  declare readonly ingredients: string[];
  declare readonly user: string;
  declare readonly brand: string;
  declare readonly organization: string;

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

  constructor(partial: Partial<PostAnalytics>) {
    Object.assign(this, partial);
  }
}
