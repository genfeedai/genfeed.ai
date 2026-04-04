import {
  ContentType,
  OptimizationCategory,
  OptimizationSuggestionType,
  Platform,
  Priority,
  Sentiment,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContentScoreDocument = ContentScore & Document;

export interface IScoreBreakdown {
  engagement: number; // 0-100
  clarity: number; // 0-100
  viralPotential: number; // 0-100
  platformOptimization: number; // 0-100
  readability: number; // 0-100
}

export interface IOptimizationSuggestion {
  type: OptimizationSuggestionType;
  category: OptimizationCategory;
  message: string;
  suggestedText?: string;
  priority: Priority;
}

@Schema({
  collection: 'content-scores',
  timestamps: true,
})
export class ContentScore {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({ required: true, type: String })
  content!: string;

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

  @Prop({ default: 0, max: 100, min: 0, required: true, type: Number })
  overallScore!: number;

  @Prop({ required: true, type: Object })
  breakdown!: IScoreBreakdown;

  @Prop({ default: [], type: Array })
  suggestions!: IOptimizationSuggestion[];

  @Prop({ default: [], type: Array })
  goals!: string[]; // ['engagement', 'reach', 'conversions']

  @Prop({ type: Object })
  metadata?: {
    wordCount?: number;
    characterCount?: number;
    hashtagCount?: number;
    emojiCount?: number;
    hasCallToAction?: boolean;
    sentiment?: Sentiment;
    readingLevel?: string;
  };

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ContentScoreSchema = SchemaFactory.createForClass(ContentScore);
