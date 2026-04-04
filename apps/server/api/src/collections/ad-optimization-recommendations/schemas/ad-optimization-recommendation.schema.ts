import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AdOptimizationRecommendationDocument =
  AdOptimizationRecommendation & Document;

export type RecommendationType =
  | 'pause'
  | 'promote'
  | 'budget_increase'
  | 'audience_expand';

export type RecommendationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ad-optimization-recommendations',
  timestamps: true,
  versionKey: false,
})
export class AdOptimizationRecommendation {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ required: true, type: String })
  runId!: string;

  @Prop({ required: true, type: Date })
  runDate!: Date;

  @Prop({
    enum: ['pause', 'promote', 'budget_increase', 'audience_expand'],
    required: true,
    type: String,
  })
  recommendationType!: RecommendationType;

  @Prop({
    enum: ['campaign', 'adset', 'ad'],
    required: true,
    type: String,
  })
  entityType!: string;

  @Prop({ required: true, type: String })
  entityId!: string;

  @Prop({ required: true, type: String })
  entityName!: string;

  @Prop({ required: true, type: String })
  reason!: string;

  @Prop({ required: true, type: Object })
  metrics!: Record<string, number>;

  @Prop({ type: Object })
  suggestedAction?: Record<string, unknown>;

  @Prop({
    default: 'pending',
    enum: ['pending', 'approved', 'rejected', 'executed', 'expired'],
    type: String,
  })
  status!: RecommendationStatus;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AdOptimizationRecommendationSchema = SchemaFactory.createForClass(
  AdOptimizationRecommendation,
);
