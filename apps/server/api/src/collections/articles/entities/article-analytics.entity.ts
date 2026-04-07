import { ArticleAnalytics } from '@api/collections/articles/schemas/article-analytics.schema';
import type { Types } from 'mongoose';

export class ArticleAnalyticsEntity implements ArticleAnalytics {
  declare readonly _id: string;

  declare readonly article: Types.ObjectId;
  declare readonly user: Types.ObjectId;
  declare readonly brand: Types.ObjectId;
  declare readonly organization: Types.ObjectId;

  declare readonly date: Date;

  declare readonly totalViews: number;
  declare readonly totalLikes: number;
  declare readonly totalComments: number;
  declare readonly totalShares: number;
  declare readonly clickThroughRate: number;

  declare readonly totalViewsIncrement: number;
  declare readonly totalLikesIncrement: number;
  declare readonly totalCommentsIncrement: number;
  declare readonly totalSharesIncrement: number;

  declare readonly engagementRate: number;

  declare readonly isDeleted: boolean;

  constructor(partial: Partial<ArticleAnalytics>) {
    Object.assign(this, partial);
  }
}
