import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

export type AnalyticDocument = Analytic & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'analytics',
  timestamps: true,
  versionKey: false,
})
export class Analytic {
  @Prop({ type: Number })
  totalClaimed!: number;

  @Prop({ type: Number })
  totalHoursWatched!: number;

  @Prop({ type: Number })
  totalVideos!: number;

  @Prop({ type: Number })
  totalImages!: number;
}

export const AnalyticSchema = SchemaFactory.createForClass(Analytic);
