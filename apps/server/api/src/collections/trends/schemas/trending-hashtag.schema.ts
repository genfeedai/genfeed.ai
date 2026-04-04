import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

export type TrendingHashtagDocument = TrendingHashtag & Document;

/**
 * TrendingHashtag Schema
 *
 * Stores trending hashtags from social platforms.
 * Data is sourced from Apify scrapers and cached globally.
 */
@Schema({ collection: 'trending-hashtags', timestamps: true })
export class TrendingHashtag {
  @Prop({
    enum: ['tiktok', 'instagram', 'youtube', 'twitter', 'reddit', 'pinterest'],
    required: true,
    type: String,
  })
  platform!: string;

  @Prop({ required: true, type: String })
  hashtag!: string;

  @Prop({ default: 0, type: Number })
  postCount!: number;

  @Prop({ default: 0, type: Number })
  viewCount!: number;

  @Prop({ default: 0, type: Number })
  growthRate!: number;

  @Prop({ default: 0, type: Number })
  viralityScore!: number;

  @Prop({ default: [], type: [String] })
  relatedHashtags!: string[];

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ default: true, type: Boolean })
  isCurrent!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ type: Date })
  lastSeenAt?: Date;
}

export const TrendingHashtagSchema =
  SchemaFactory.createForClass(TrendingHashtag);
