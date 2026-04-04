import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ArticleAnalyticsDocument = ArticleAnalytics & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'article-analytics',
  timestamps: true,
  versionKey: false,
})
export class ArticleAnalytics {
  @Prop({
    index: true,
    ref: 'Article',
    required: true,
    type: Types.ObjectId,
  })
  article!: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({ index: true, required: true, type: Date })
  date!: Date;

  @Prop({ default: 0, type: Number })
  totalViews!: number;

  @Prop({ default: 0, type: Number })
  totalLikes!: number;

  @Prop({ default: 0, type: Number })
  totalComments!: number;

  @Prop({ default: 0, type: Number })
  totalShares!: number;

  @Prop({ default: 0, type: Number })
  clickThroughRate!: number;

  // Incremental values (difference from previous day)
  @Prop({ default: 0, type: Number })
  totalViewsIncrement!: number;

  @Prop({ default: 0, type: Number })
  totalLikesIncrement!: number;

  @Prop({ default: 0, type: Number })
  totalCommentsIncrement!: number;

  @Prop({ default: 0, type: Number })
  totalSharesIncrement!: number;

  // Engagement rate for the day
  @Prop({ default: 0, type: Number })
  engagementRate!: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ArticleAnalyticsSchema =
  SchemaFactory.createForClass(ArticleAnalytics);

// Compound indexes for efficient queries
ArticleAnalyticsSchema.index({ article: 1, date: -1 });
ArticleAnalyticsSchema.index({ date: -1, organization: 1 });
ArticleAnalyticsSchema.index({ brand: 1, date: -1 });
ArticleAnalyticsSchema.index({ article: 1, date: 1 }, { unique: true });
