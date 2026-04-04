import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AdPerformanceDocument = AdPerformance & Document;

export type AdPlatform = 'meta' | 'google' | 'tiktok';
export type AdGranularity = 'campaign' | 'adset' | 'ad';
export type AdScope = 'organization' | 'public';
export type AttributionWindow =
  | '1d_click'
  | '7d_click'
  | '28d_click'
  | '1d_view'
  | '7d_view';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ad-performance',
  timestamps: true,
  versionKey: false,
})
export class AdPerformance {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ ref: 'Credential', required: true, type: Types.ObjectId })
  credential!: Types.ObjectId;

  @Prop({ enum: ['meta', 'google', 'tiktok'], required: true, type: String })
  adPlatform!: AdPlatform;

  @Prop({ enum: ['campaign', 'adset', 'ad'], required: true, type: String })
  granularity!: AdGranularity;

  @Prop({ required: true, type: String })
  externalAccountId!: string;

  @Prop({ type: String })
  externalCampaignId?: string;

  @Prop({ type: String })
  externalAdSetId?: string;

  @Prop({ type: String })
  externalAdGroupId?: string;

  @Prop({ type: String })
  externalAdId?: string;

  @Prop({ type: String })
  campaignName?: string;

  @Prop({ type: String })
  campaignObjective?: string;

  @Prop({ type: String })
  campaignStatus?: string;

  @Prop({ type: String })
  headlineText?: string;

  @Prop({ type: String })
  bodyText?: string;

  @Prop({ type: String })
  ctaText?: string;

  @Prop({ default: [], type: [String] })
  imageUrls!: string[];

  @Prop({ default: [], type: [String] })
  videoUrls!: string[];

  @Prop({ type: String })
  landingPageUrl?: string;

  @Prop({ type: String })
  industry?: string;

  @Prop({ default: [], type: [String] })
  tags!: string[];

  @Prop({ default: 'USD', type: String })
  currency!: string;

  @Prop({ default: 0, type: Number })
  spend!: number;

  @Prop({ default: 0, type: Number })
  impressions!: number;

  @Prop({ default: 0, type: Number })
  clicks!: number;

  @Prop({ type: Number })
  conversions?: number;

  @Prop({ type: Number })
  revenue?: number;

  @Prop({ default: 0, type: Number })
  ctr!: number;

  @Prop({ default: 0, type: Number })
  cpc!: number;

  @Prop({ default: 0, type: Number })
  cpm!: number;

  @Prop({ type: Number })
  cpa?: number;

  @Prop({ type: Number })
  roas?: number;

  @Prop({ type: Number })
  conversionRate?: number;

  @Prop({
    enum: ['1d_click', '7d_click', '28d_click', '1d_view', '7d_view'],
    type: String,
  })
  attributionWindow?: AttributionWindow;

  @Prop({ required: true, type: Date })
  date!: Date;

  @Prop({
    default: 'organization',
    enum: ['organization', 'public'],
    type: String,
  })
  scope!: AdScope;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  performanceScore!: number;

  @Prop({ default: 0.5, max: 1, min: 0, type: Number })
  dataConfidence!: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AdPerformanceSchema = SchemaFactory.createForClass(AdPerformance);
