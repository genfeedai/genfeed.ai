import { CredentialPlatform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PostAnalyticsDocument = PostAnalytics & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'post-analytics',
  timestamps: true,
  versionKey: false,
})
export class PostAnalytics {
  @Prop({
    ref: 'Post',
    required: true,
    type: Types.ObjectId,
  })
  post!: Types.ObjectId;

  @Prop({
    required: true,
    type: [
      {
        ref: 'Ingredient',
        type: Types.ObjectId,
      },
    ],
  })
  ingredients!: Types.ObjectId[];

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({
    enum: Object.values(CredentialPlatform),
    required: true,
    type: String,
  })
  platform!: CredentialPlatform;

  @Prop({ required: true, type: Date })
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
  totalSaves!: number;

  // Incremental values (difference from previous day)
  @Prop({ default: 0, type: Number })
  totalViewsIncrement!: number;

  @Prop({ default: 0, type: Number })
  totalLikesIncrement!: number;

  @Prop({ default: 0, type: Number })
  totalCommentsIncrement!: number;

  @Prop({ default: 0, type: Number })
  totalSharesIncrement!: number;

  @Prop({ default: 0, type: Number })
  totalSavesIncrement!: number;

  // Engagement rate for the day
  @Prop({ default: 0, type: Number })
  engagementRate!: number;
}

export const PostAnalyticsSchema = SchemaFactory.createForClass(PostAnalytics);
