import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { CredentialPlatform } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class PostAnalyticsEntity implements PostAnalytics {
  declare readonly _id: string;

  declare readonly post: Types.ObjectId;
  declare readonly ingredients: Types.ObjectId[];
  declare readonly user: Types.ObjectId;
  declare readonly brand: Types.ObjectId;
  declare readonly organization: Types.ObjectId;

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
