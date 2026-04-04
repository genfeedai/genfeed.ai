import {
  ContentIntelligencePlatform,
  ContentPatternType,
  TemplateCategory,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContentPatternDocument = ContentPattern & Document;

@Schema({ _id: false })
export class PatternSourceMetrics {
  @Prop({ default: 0, type: Number })
  likes!: number;

  @Prop({ default: 0, type: Number })
  comments!: number;

  @Prop({ default: 0, type: Number })
  shares!: number;

  @Prop({ default: 0, type: Number })
  views!: number;

  @Prop({ default: 0, type: Number })
  engagementRate!: number;

  @Prop({ default: 0, type: Number })
  viralScore!: number;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'content-patterns',
  timestamps: true,
  versionKey: false,
})
export class ContentPattern {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'CreatorAnalysis',
    required: false,
    type: Types.ObjectId,
  })
  sourceCreator?: Types.ObjectId;

  @Prop({
    enum: Object.values(ContentIntelligencePlatform),
    required: true,
    type: String,
  })
  platform!: ContentIntelligencePlatform;

  @Prop({
    enum: Object.values(ContentPatternType),
    required: true,
    type: String,
  })
  patternType!: ContentPatternType;

  @Prop({
    enum: Object.values(TemplateCategory),
    required: false,
    type: String,
  })
  templateCategory?: TemplateCategory;

  @Prop({ required: true, type: String })
  rawExample!: string;

  @Prop({ required: true, type: String })
  extractedFormula!: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ default: [], type: [String] })
  placeholders!: string[];

  @Prop({ default: {}, type: PatternSourceMetrics })
  sourceMetrics!: PatternSourceMetrics;

  @Prop({ type: [Number] })
  embedding?: number[];

  @Prop({ default: [], type: [String] })
  tags!: string[];

  @Prop({ default: 1.0, max: 1.0, min: 0.0, type: Number })
  relevanceWeight!: number;

  @Prop({ default: 0, type: Number })
  usageCount!: number;

  @Prop({ type: String })
  sourcePostId?: string;

  @Prop({ type: String })
  sourcePostUrl?: string;

  @Prop({ type: Date })
  sourcePostDate?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const PatternSourceMetricsSchema =
  SchemaFactory.createForClass(PatternSourceMetrics);
export const ContentPatternSchema =
  SchemaFactory.createForClass(ContentPattern);
