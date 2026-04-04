import {
  ContentIntelligencePlatform,
  CreatorAnalysisStatus,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CreatorAnalysisDocument = CreatorAnalysis & Document;

@Schema({ _id: false })
export class CreatorScrapeConfig {
  @Prop({ default: 100, max: 500, min: 10, type: Number })
  maxPosts!: number;

  @Prop({ default: 90, max: 365, min: 7, type: Number })
  dateRangeDays!: number;

  @Prop({ default: false, type: Boolean })
  includeReplies!: boolean;
}

@Schema({ _id: false })
export class CreatorMetrics {
  @Prop({ default: 0, type: Number })
  avgEngagementRate!: number;

  @Prop({ default: 0, type: Number })
  avgViralScore!: number;

  @Prop({ default: 0, type: Number })
  postFrequency!: number;

  @Prop({ default: [], type: [String] })
  bestPostingTimes!: string[];

  @Prop({ default: [], type: [String] })
  topHashtags!: string[];

  @Prop({ default: 0, type: Number })
  avgLikes!: number;

  @Prop({ default: 0, type: Number })
  avgComments!: number;

  @Prop({ default: 0, type: Number })
  avgShares!: number;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'creator-analyses',
  timestamps: true,
  versionKey: false,
})
export class CreatorAnalysis {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: false,
    type: Types.ObjectId,
  })
  createdBy?: Types.ObjectId;

  @Prop({
    enum: Object.values(ContentIntelligencePlatform),
    required: true,
    type: String,
  })
  platform!: ContentIntelligencePlatform;

  @Prop({ required: true, trim: true, type: String })
  handle!: string;

  @Prop({ trim: true, type: String })
  displayName?: string;

  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({ type: String })
  profileUrl?: string;

  @Prop({ type: String })
  bio?: string;

  @Prop({ default: 0, type: Number })
  followerCount!: number;

  @Prop({ default: 0, type: Number })
  followingCount!: number;

  @Prop({
    default: CreatorAnalysisStatus.PENDING,
    enum: Object.values(CreatorAnalysisStatus),
    type: String,
  })
  status!: CreatorAnalysisStatus;

  @Prop({ type: Date })
  lastScrapedAt?: Date;

  @Prop({ default: 0, type: Number })
  postsScraped!: number;

  @Prop({ default: 0, type: Number })
  patternsExtracted!: number;

  @Prop({ default: {}, type: CreatorScrapeConfig })
  scrapeConfig!: CreatorScrapeConfig;

  @Prop({ default: {}, type: CreatorMetrics })
  metrics!: CreatorMetrics;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ default: [], type: [String] })
  tags!: string[];

  @Prop({ type: String })
  niche?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CreatorScrapeConfigSchema =
  SchemaFactory.createForClass(CreatorScrapeConfig);
export const CreatorMetricsSchema =
  SchemaFactory.createForClass(CreatorMetrics);
export const CreatorAnalysisSchema =
  SchemaFactory.createForClass(CreatorAnalysis);
