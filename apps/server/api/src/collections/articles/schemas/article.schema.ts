import { ArticleCategory, ArticleScope, ArticleStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ArticleDocument = Article & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'articles',
  timestamps: true,
  versionKey: false,
})
export class Article {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({
    ref: 'Asset',
    required: false,
    type: Types.ObjectId,
  })
  banner?: Types.ObjectId;

  @Prop({
    maxlength: 200,
    required: true,
    trim: true,
    type: String,
  })
  label!: string;

  @Prop({
    lowercase: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    required: true,
    trim: true,
    type: String,
    unique: true,
  })
  slug!: string;

  @Prop({
    maxlength: 500,
    required: true,
    trim: true,
    type: String,
  })
  summary!: string;

  @Prop({
    default: '',
    required: false, // Allow empty for PROCESSING status
    type: String,
  })
  content!: string;

  @Prop({
    default: ArticleCategory.POST,
    enum: Object.values(ArticleCategory),
    required: false,
    type: String,
  })
  category!: ArticleCategory;

  @Prop({
    default: ArticleStatus.DRAFT,
    enum: Object.values(ArticleStatus),
    required: true,
    type: String,
  })
  status!: ArticleStatus;

  @Prop({
    default: [],
    ref: 'Tag',
    required: false,
    type: [Types.ObjectId],
  })
  tags!: Types.ObjectId[];

  @Prop({
    default: ArticleScope.USER,
    enum: Object.values(ArticleScope),
    index: true,
    type: String,
  })
  scope!: ArticleScope;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;

  @Prop({
    required: false,
    type: Date,
  })
  publishedAt?: Date;

  @Prop({
    required: false,
    type: Object,
  })
  viralityAnalysis?: {
    score: number; // 0-100
    factors: {
      emotionalAppeal: number; // 0-100
      shareability: number; // 0-100
      readability: number; // 0-100
      seoScore: number; // 0-100
      trendAlignment: number; // 0-100
    };
    predictions: {
      estimatedReach: number;
      estimatedShares: number;
      estimatedEngagement: number;
    };
    suggestions: string[]; // AI recommendations to improve virality
    analyzedAt: Date;
  };

  @Prop({
    required: false,
    type: Object,
  })
  performanceMetrics?: {
    views: number;
    shares: number;
    likes: number;
    comments: number;
    engagementRate: number; // percentage
    clickThroughRate: number; // percentage
    lastUpdated: Date;
  };

  @Prop({
    required: false,
    type: Object,
  })
  aiGeneration?: {
    threadId?: string; // OpenAI assistant thread ID
    runId?: string; // OpenAI assistant run ID
    prompt?: string; // Original generation prompt
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
  };

  @Prop({
    maxlength: 2000,
    required: false,
    trim: true,
    type: String,
  })
  generationPrompt?: string;

  @Prop({
    required: false,
    type: Object,
  })
  xArticleMetadata?: {
    sections: {
      id: string;
      heading: string;
      content: string;
      order: number;
      pullQuote?: string;
    }[];
    headerImagePrompt?: string;
    headerImageUrl?: string;
    estimatedReadTime: number;
    wordCount: number;
  };
}

export const ArticleSchema = SchemaFactory.createForClass(Article);
