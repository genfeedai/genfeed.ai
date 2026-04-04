import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

export type AdInsightsDocument = AdInsights & Document;

export type InsightType =
  | 'top_headlines'
  | 'best_ctas'
  | 'optimal_spend'
  | 'platform_comparison'
  | 'industry_benchmark';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ad-insights',
  timestamps: true,
  versionKey: false,
})
export class AdInsights {
  @Prop({
    enum: [
      'top_headlines',
      'best_ctas',
      'optimal_spend',
      'platform_comparison',
      'industry_benchmark',
    ],
    required: true,
    type: String,
  })
  insightType!: InsightType;

  @Prop({ enum: ['meta', 'google', 'tiktok'], type: String })
  adPlatform?: string;

  @Prop({ type: String })
  industry?: string;

  @Prop({ required: true, type: Object })
  data!: Record<string, unknown>;

  @Prop({ default: 0, min: 0, type: Number })
  sampleSize!: number;

  @Prop({ required: true, type: Date })
  computedAt!: Date;

  @Prop({ required: true, type: Date })
  validUntil!: Date;

  @Prop({ default: 'public', type: String })
  scope!: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AdInsightsSchema = SchemaFactory.createForClass(AdInsights);
