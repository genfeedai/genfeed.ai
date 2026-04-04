import type { PatternType } from '@genfeedai/interfaces';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CreativePatternDocument = CreativePattern & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'creative-patterns',
  timestamps: true,
  versionKey: false,
})
export class CreativePattern {
  @Prop({
    enum: [
      'hook_formula',
      'cta_formula',
      'content_structure',
      'caption_formula',
      'visual_style',
    ],
    required: true,
    type: String,
  })
  patternType!: PatternType;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ required: true, type: String })
  formula!: string;

  @Prop({
    default: [],
    type: [{ platform: String, score: Number, source: String, text: String }],
  })
  examples!: Array<{
    text: string;
    score: number;
    platform: string;
    source: 'ad' | 'organic';
  }>;

  @Prop({ type: String })
  platform?: string;

  @Prop({ type: String })
  industry?: string;

  @Prop({
    enum: ['ad', 'organic', 'both'],
    required: true,
    type: String,
  })
  source!: 'ad' | 'organic' | 'both';

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  avgPerformanceScore!: number;

  @Prop({ default: 0, type: Number })
  sampleSize!: number;

  @Prop({ default: 'public', enum: ['public', 'private'], type: String })
  scope!: 'public' | 'private';

  @Prop({ ref: 'Organization', type: Types.ObjectId })
  organization?: Types.ObjectId;

  @Prop({ ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: true, type: Date })
  computedAt!: Date;

  @Prop({ required: true, type: Date })
  validUntil!: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CreativePatternSchema =
  SchemaFactory.createForClass(CreativePattern);
