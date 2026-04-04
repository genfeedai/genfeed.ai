import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ForecastDocument = Forecast & Document;

export interface IPrediction {
  date: string; // ISO date
  value: number;
  confidence: number; // 0-100
  range: {
    min: number;
    max: number;
  };
}

@Schema({ collection: 'forecasts', timestamps: true })
export class Forecast {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({ required: true, type: String })
  metric!: string; // 'engagement', 'followers', 'clicks', 'revenue'

  @Prop({ required: true, type: String })
  period!: string; // '30d', '60d', '90d'

  @Prop({ required: true, type: Number })
  currentValue!: number;

  @Prop({
    enum: ['increasing', 'decreasing', 'stable'],
    required: true,
    type: String,
  })
  trend!: 'increasing' | 'decreasing' | 'stable';

  @Prop({ default: [], type: Array })
  predictions!: IPrediction[];

  @Prop({ max: 100, min: 0, type: Number })
  confidence?: number; // Overall forecast confidence

  @Prop({ default: [], type: Array })
  factors!: string[]; // What's driving the trend

  @Prop({ type: Date })
  validUntil?: Date; // When forecast expires

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ForecastSchema = SchemaFactory.createForClass(Forecast);
