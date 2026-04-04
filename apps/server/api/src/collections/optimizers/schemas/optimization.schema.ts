import { ContentType, Platform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type OptimizationDocument = Optimization & Document;

export interface IContentChange {
  field: string;
  original: string;
  optimized: string;
  reason: string;
}

@Schema({ collection: 'optimizations', timestamps: true })
export class Optimization {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({ ref: 'ContentScore', type: Types.ObjectId })
  score?: Types.ObjectId;

  @Prop({ required: true, type: String })
  originalContent!: string;

  @Prop({ required: true, type: String })
  optimizedContent!: string;

  @Prop({
    enum: Object.values(ContentType),
    required: true,
    type: String,
  })
  contentType!: ContentType;

  @Prop({
    enum: Object.values(Platform),
    type: String,
  })
  platform?: Platform;

  @Prop({ default: [], type: Array })
  changes!: IContentChange[];

  @Prop({ max: 100, min: 0, type: Number })
  improvementScore?: number; // How much better is the optimized version

  @Prop({ default: [], type: Array })
  goals!: string[]; // What was being optimized for

  @Prop({ default: false, type: Boolean })
  wasApplied!: boolean; // Did user use the optimized version?

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const OptimizationSchema = SchemaFactory.createForClass(Optimization);
