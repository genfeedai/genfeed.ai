import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AdOptimizationConfigDocument = AdOptimizationConfig & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ad-optimization-configs',
  timestamps: true,
  versionKey: false,
})
export class AdOptimizationConfig {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
    unique: true,
  })
  organization!: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isEnabled!: boolean;

  // Thresholds
  @Prop({ default: 50, type: Number })
  maxCpm!: number;

  @Prop({ default: 0.5, type: Number })
  minCtr!: number;

  @Prop({ default: 1.0, type: Number })
  minRoas!: number;

  @Prop({ default: 10, type: Number })
  minSpend!: number;

  @Prop({ default: 1000, type: Number })
  minImpressions!: number;

  @Prop({ default: 7, type: Number })
  analysisWindow!: number;

  // Budget safety caps
  @Prop({ default: 500, type: Number })
  maxDailyBudgetPerCampaign!: number;

  @Prop({ default: 2000, type: Number })
  maxTotalDailySpend!: number;

  @Prop({ default: 20, type: Number })
  maxBudgetIncreasePct!: number;

  // Notifications
  @Prop({ default: true, type: Boolean })
  isNotifyInApp!: boolean;

  @Prop({ type: String })
  webhookUrl?: string;

  @Prop({ type: String })
  notifyEmail?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AdOptimizationConfigSchema =
  SchemaFactory.createForClass(AdOptimizationConfig);
