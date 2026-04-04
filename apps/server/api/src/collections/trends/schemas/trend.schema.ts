import type { TrendSourceItem } from '@api/collections/trends/interfaces/trend.interfaces';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TrendDocument = Trend & Document;

@Schema({ collection: 'trends', timestamps: true })
export class Trend {
  @Prop({
    enum: [
      'tiktok',
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
      'reddit',
      'pinterest',
    ],
    required: true,
    type: String,
  })
  platform!: string;

  @Prop({ required: true, type: String })
  topic!: string;

  @Prop({ default: 0, required: true, type: Number })
  mentions!: number;

  @Prop({ default: 0, required: true, type: Number })
  growthRate!: number;

  @Prop({ default: 0, required: true, type: Number })
  viralityScore!: number;

  @Prop({ default: {}, type: Object })
  metadata!: {
    hashtags?: string[];
    urls?: string[];
    sampleContent?: string;
    engagementRate?: number;
    reach?: number;
    impressions?: number;
    // Extended metadata for Apify integration
    thumbnailUrl?: string;
    videoUrl?: string;
    creatorHandle?: string;
    soundId?: string;
    soundName?: string;
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    duration?: number;
    trendType?: 'topic' | 'hashtag' | 'sound' | 'video' | 'creator';
    source?: 'apify' | 'grok' | 'native-api';
    sourcePreviewCache?: TrendSourceItem[];
    sourcePreviewCachedAt?: string;
    sourcePreviewState?: 'live' | 'fallback' | 'empty';
    [key: string]: unknown;
  };

  @Prop({ default: null, ref: 'Organization', type: Types.ObjectId })
  organization?: Types.ObjectId;

  @Prop({ default: null, ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  requiresAuth!: boolean;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ default: true, type: Boolean })
  isCurrent!: boolean; // Mark as current (active) or historical

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TrendSchema = SchemaFactory.createForClass(Trend);
