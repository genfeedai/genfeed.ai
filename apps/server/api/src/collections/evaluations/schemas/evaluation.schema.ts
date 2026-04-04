import {
  EvaluationSeverity,
  EvaluationType,
  ExternalPlatform,
  IngredientCategory,
  Status,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type EvaluationDocument = Evaluation & Document;

// TypeScript interfaces for nested objects
export interface ITechnicalScores {
  overall: number;
  resolution?: number;
  frameRate?: number;
  audioQuality?: number;
  audioSync?: number;
  formatting?: number;
  readability?: number;
  seoScore?: number;
}

export interface IBrandScores {
  overall: number;
  styleAlignment: number;
  messageAlignment: number;
  toneAlignment: number;
  visualConsistency?: number;
}

export interface IEngagementScores {
  overall: number;
  viralityPotential: number;
  emotionalAppeal: number;
  shareability: number;
  platformFit: number;
}

export interface IScores {
  technical: ITechnicalScores;
  brand: IBrandScores;
  engagement: IEngagementScores;
}

export interface IEvaluationAnalysis {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  aiModel: string;
  prompt?: string;
}

export interface IEvaluationFlags {
  isFlagged: boolean;
  severity: EvaluationSeverity;
  reasons: string[];
}

export interface IExternalContent {
  sourceUrl: string;
  platform: ExternalPlatform;
  downloadedUrl?: string;
  replicationInsights: string[];
}

export interface IActualPerformance {
  views: number;
  engagement: number;
  engagementRate: number;
  accuracyScore: number;
  syncedAt: Date;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'evaluations',
  timestamps: true,
  versionKey: false,
})
export class Evaluation {
  _id!: string;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  // Link to content (polymorphic reference)
  @Prop({
    enum: [...Object.values(IngredientCategory), 'article', 'post'],
    required: true,
    type: String,
  })
  contentType!: string;

  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
  })
  content!: Types.ObjectId;

  @Prop({
    enum: Object.values(EvaluationType),
    index: true,
    required: true,
    type: String,
  })
  evaluationType!: EvaluationType;

  @Prop({
    default: Status.PROCESSING,
    enum: [Status.PROCESSING, Status.COMPLETED, Status.FAILED],
    index: true,
    type: String,
  })
  status!: Status;

  @Prop({
    max: 100,
    min: 0,
    required: false,
    type: Number,
  })
  overallScore?: number;

  @Prop({
    required: false,
    type: Object,
  })
  scores?: IScores;

  @Prop({
    required: false,
    type: Object,
  })
  analysis?: IEvaluationAnalysis;

  @Prop({
    required: false,
    type: Object,
  })
  flags?: IEvaluationFlags;

  @Prop({
    required: false,
    type: Object,
  })
  externalContent?: IExternalContent;

  @Prop({
    required: false,
    type: Object,
  })
  actualPerformance?: IActualPerformance;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const EvaluationSchema = SchemaFactory.createForClass(Evaluation);
