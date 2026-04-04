import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TrendSourceReferenceLinkDocument = TrendSourceReferenceLink &
  Document;

@Schema({
  collection: 'trend-source-reference-links',
  timestamps: true,
  versionKey: false,
})
export class TrendSourceReferenceLink {
  @Prop({ ref: 'Trend', required: true, type: Types.ObjectId })
  trend!: Types.ObjectId;

  @Prop({ ref: 'TrendSourceReference', required: true, type: Types.ObjectId })
  sourceReference!: Types.ObjectId;

  @Prop({ default: Date.now, required: true, type: Date })
  matchedAt!: Date;

  @Prop({ type: String })
  matchReason?: string;

  @Prop({ type: Number })
  rankAtCapture?: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TrendSourceReferenceLinkSchema = SchemaFactory.createForClass(
  TrendSourceReferenceLink,
);
