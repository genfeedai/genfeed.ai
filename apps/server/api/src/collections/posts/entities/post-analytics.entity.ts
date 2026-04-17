import { CredentialPlatform } from '@genfeedai/enums';
import { type PostAnalytics } from '@genfeedai/prisma';

export class PostAnalyticsEntity implements PostAnalytics {
  declare readonly _id: string;

  declare readonly post: string;
  declare readonly ingredients: string[];
  declare readonly user: string;
  declare readonly brand: string;
  declare readonly organization: string;

  declare readonly platform: CredentialPlatform;
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
