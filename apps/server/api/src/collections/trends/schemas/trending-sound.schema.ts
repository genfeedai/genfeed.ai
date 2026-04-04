import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

export type TrendingSoundDocument = TrendingSound & Document;

/**
 * TrendingSound Schema
 *
 * Stores trending sounds/audio from TikTok.
 * Data is sourced from Apify scrapers and cached globally.
 */
@Schema({ collection: 'trending-sounds', timestamps: true })
export class TrendingSound {
  @Prop({ default: 'tiktok', type: String })
  platform!: string;

  @Prop({ required: true, type: String })
  soundId!: string;

  @Prop({ required: true, type: String })
  soundName!: string;

  @Prop({ type: String })
  authorName?: string;

  @Prop({ type: String })
  coverUrl?: string;

  @Prop({ type: String })
  playUrl?: string;

  @Prop({ default: 0, type: Number })
  usageCount!: number;

  @Prop({ default: 0, type: Number })
  growthRate!: number;

  @Prop({ default: 0, type: Number })
  viralityScore!: number;

  @Prop({ type: Number })
  duration?: number;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ default: true, type: Boolean })
  isCurrent!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ type: Date })
  lastSeenAt?: Date;
}

export const TrendingSoundSchema = SchemaFactory.createForClass(TrendingSound);
