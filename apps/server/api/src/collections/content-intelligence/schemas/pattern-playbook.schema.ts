import { ContentIntelligencePlatform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PatternPlaybookDocument = PatternPlaybook & Document;

@Schema({ _id: false })
export class TopHook {
  @Prop({ required: true, type: String })
  formula!: string;

  @Prop({ default: 0, type: Number })
  avgEngagement!: number;

  @Prop({ default: 0, type: Number })
  count!: number;
}

@Schema({ _id: false })
export class PostingSchedule {
  @Prop({ default: [], type: [String] })
  bestDays!: string[];

  @Prop({ default: [], type: [String] })
  bestTimes!: string[];

  @Prop({ default: 0, type: Number })
  frequency!: number;
}

@Schema({ _id: false })
export class ContentMix {
  @Prop({ default: 0, max: 1, min: 0, type: Number })
  story!: number;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  list!: number;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  contrarian!: number;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  caseStudy!: number;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  curation!: number;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  question!: number;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  thread!: number;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  giveaway!: number;
}

@Schema({ _id: false })
export class HashtagStrategy {
  @Prop({ default: [], type: [String] })
  trending!: string[];

  @Prop({ default: [], type: [String] })
  niche!: string[];

  @Prop({ default: [], type: [String] })
  branded!: string[];

  @Prop({ default: 0, type: Number })
  optimalCount!: number;
}

@Schema({ _id: false })
export class Benchmarks {
  @Prop({ default: 0, type: Number })
  avgLikes!: number;

  @Prop({ default: 0, type: Number })
  avgComments!: number;

  @Prop({ default: 0, type: Number })
  avgShares!: number;

  @Prop({ default: 0, type: Number })
  avgViews!: number;

  @Prop({ default: 0, type: Number })
  avgEngagementRate!: number;

  @Prop({ default: 0, type: Number })
  topPerformerThreshold!: number;
}

@Schema({ _id: false })
export class PlaybookInsights {
  @Prop({ default: [], type: [TopHook] })
  topHooks!: TopHook[];

  @Prop({ default: {}, type: PostingSchedule })
  postingSchedule!: PostingSchedule;

  @Prop({ default: {}, type: ContentMix })
  contentMix!: ContentMix;

  @Prop({ default: {}, type: HashtagStrategy })
  hashtagStrategy!: HashtagStrategy;

  @Prop({ default: {}, type: Benchmarks })
  benchmarks!: Benchmarks;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'pattern-playbooks',
  timestamps: true,
  versionKey: false,
})
export class PatternPlaybook {
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

  @Prop({ required: true, trim: true, type: String })
  name!: string;

  @Prop({ trim: true, type: String })
  description?: string;

  @Prop({
    enum: [...Object.values(ContentIntelligencePlatform), 'all'],
    required: true,
    type: String,
  })
  platform!: ContentIntelligencePlatform | 'all';

  @Prop({ type: String })
  niche?: string;

  @Prop({ default: {}, type: PlaybookInsights })
  insights!: PlaybookInsights;

  @Prop({
    default: [],
    ref: 'CreatorAnalysis',
    type: [Types.ObjectId],
  })
  sourceCreators!: Types.ObjectId[];

  @Prop({ default: 0, type: Number })
  patternsCount!: number;

  @Prop({ type: Date })
  lastUpdatedAt?: Date;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TopHookSchema = SchemaFactory.createForClass(TopHook);
export const PostingScheduleSchema =
  SchemaFactory.createForClass(PostingSchedule);
export const ContentMixSchema = SchemaFactory.createForClass(ContentMix);
export const HashtagStrategySchema =
  SchemaFactory.createForClass(HashtagStrategy);
export const BenchmarksSchema = SchemaFactory.createForClass(Benchmarks);
export const PlaybookInsightsSchema =
  SchemaFactory.createForClass(PlaybookInsights);
export const PatternPlaybookSchema =
  SchemaFactory.createForClass(PatternPlaybook);
