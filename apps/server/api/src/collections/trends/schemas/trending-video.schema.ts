import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

export type TrendingVideoDocument = TrendingVideo & Document;

/**
 * TrendingVideo Schema
 *
 * Stores viral/trending videos from social platforms for the leaderboard.
 * Data is sourced from Apify scrapers and cached globally.
 */
@Schema({ collection: 'trending-videos', timestamps: true })
export class TrendingVideo {
  @Prop({
    enum: ['tiktok', 'instagram', 'youtube', 'twitter', 'reddit', 'pinterest'],
    required: true,
    type: String,
  })
  platform!: string;

  @Prop({ required: true, type: String })
  externalId!: string;

  @Prop({ type: String })
  title?: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ required: true, type: String })
  creatorHandle!: string;

  @Prop({ type: String })
  creatorId?: string;

  @Prop({ type: String })
  thumbnailUrl?: string;

  @Prop({ type: String })
  videoUrl?: string;

  @Prop({ default: 0, type: Number })
  viewCount!: number;

  @Prop({ default: 0, type: Number })
  likeCount!: number;

  @Prop({ default: 0, type: Number })
  commentCount!: number;

  @Prop({ default: 0, type: Number })
  shareCount!: number;

  @Prop({ type: Number })
  duration?: number;

  @Prop({ default: 0, type: Number })
  engagementRate!: number;

  @Prop({ default: 0, type: Number })
  viralScore!: number;

  @Prop({ default: 0, type: Number })
  velocity!: number;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ default: [], type: [String] })
  hashtags!: string[];

  @Prop({ type: String })
  soundId?: string;

  @Prop({ type: String })
  soundName?: string;

  @Prop({ type: String })
  hook?: string;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ default: true, type: Boolean })
  isCurrent!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ type: Date })
  lastSeenAt?: Date;
}

export const TrendingVideoSchema = SchemaFactory.createForClass(TrendingVideo);
