import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type InsightDocument = Insight & Document;

@Schema({ collection: 'insights', timestamps: true })
export class Insight {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    enum: ['trend', 'opportunity', 'warning', 'tip'],
    required: true,
    type: String,
  })
  category!: 'trend' | 'opportunity' | 'warning' | 'tip';

  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ enum: ['high', 'medium', 'low'], required: true, type: String })
  impact!: 'high' | 'medium' | 'low';

  @Prop({ max: 100, min: 0, required: true, type: Number })
  confidence!: number;

  @Prop({ default: [], type: Array })
  actionableSteps!: string[];

  @Prop({ default: [], type: Array })
  relatedMetrics!: string[];

  @Prop({ type: Object })
  data?: Record<string, unknown>; // Supporting data

  @Prop({ default: false, type: Boolean })
  isRead!: boolean;

  @Prop({ default: false, type: Boolean })
  isDismissed!: boolean;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const InsightSchema = SchemaFactory.createForClass(Insight);
