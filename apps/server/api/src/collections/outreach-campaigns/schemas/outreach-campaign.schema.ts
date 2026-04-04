import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type OutreachCampaignDocument = OutreachCampaign & Document;

/**
 * Discovery configuration for AI-powered target discovery
 */
@Schema({ _id: false })
export class OutreachCampaignDiscoveryConfig {
  @Prop({ default: [], type: [String] })
  keywords!: string[];

  @Prop({ default: [], type: [String] })
  hashtags!: string[];

  @Prop({ default: [], type: [String] })
  subreddits!: string[];

  @Prop({ default: [], type: [String] })
  excludeAuthors!: string[];

  @Prop({ default: 0, min: 0, type: Number })
  minEngagement!: number;

  @Prop({ default: 10000, min: 0, type: Number })
  maxEngagement!: number;

  @Prop({ default: 24, min: 1, type: Number })
  maxAgeHours!: number;

  @Prop({ default: 0.5, max: 1, min: 0, type: Number })
  minRelevanceScore!: number;
}

/**
 * AI configuration for reply generation
 */
@Schema({ _id: false })
export class OutreachCampaignAiConfig {
  @Prop({
    default: ReplyTone.FRIENDLY,
    enum: Object.values(ReplyTone),
    type: String,
  })
  tone!: ReplyTone;

  @Prop({
    default: ReplyLength.MEDIUM,
    enum: Object.values(ReplyLength),
    type: String,
  })
  length!: ReplyLength;

  @Prop({ trim: true, type: String })
  customInstructions?: string;

  @Prop({ trim: true, type: String })
  context?: string;

  @Prop({ trim: true, type: String })
  ctaLink?: string;

  @Prop({ default: true, type: Boolean })
  useAiGeneration!: boolean;

  @Prop({ trim: true, type: String })
  templateText?: string;
}

/**
 * DM configuration for DM outreach campaigns
 */
@Schema({ _id: false })
export class OutreachCampaignDmConfig {
  @Prop({ default: true, type: Boolean })
  useAiGeneration!: boolean;

  @Prop({ trim: true, type: String })
  templateText?: string;

  @Prop({ trim: true, type: String })
  context?: string;

  @Prop({ trim: true, type: String })
  customInstructions?: string;

  @Prop({ trim: true, type: String })
  ctaLink?: string;

  @Prop({ trim: true, type: String })
  offer?: string;
}

/**
 * Rate limit configuration for campaign
 */
@Schema({ _id: false })
export class OutreachCampaignRateLimits {
  @Prop({ default: 10, max: 50, min: 1, type: Number })
  maxPerHour!: number;

  @Prop({ default: 50, max: 200, min: 1, type: Number })
  maxPerDay!: number;

  @Prop({ default: 60, min: 30, type: Number })
  delayBetweenRepliesSeconds!: number;

  @Prop({ default: 0, type: Number })
  currentHourCount!: number;

  @Prop({ default: 0, type: Number })
  currentDayCount!: number;

  @Prop({ type: Date })
  hourResetAt?: Date;

  @Prop({ type: Date })
  dayResetAt?: Date;
}

/**
 * Schedule configuration for campaign
 */
@Schema({ _id: false })
export class OutreachCampaignSchedule {
  @Prop({ type: Date })
  startAt?: Date;

  @Prop({ type: Date })
  endAt?: Date;

  @Prop({ default: 'America/Los_Angeles', type: String })
  timezone?: string;

  @Prop({
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    type: [String],
  })
  activeDays?: string[];

  @Prop({ default: '09:00', type: String })
  activeStartTime?: string;

  @Prop({ default: '21:00', type: String })
  activeEndTime?: string;
}

/**
 * Campaign Schema
 *
 * Stores marketing campaign configurations for proactive outreach.
 * Supports manual target addition, AI-powered discovery, and scheduled blasts.
 */
@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'outreach-campaigns',
  timestamps: true,
  versionKey: false,
})
export class OutreachCampaign {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ index: true, ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ index: true, ref: 'User', type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({
    ref: 'Credential',
    required: true,
    type: Types.ObjectId,
  })
  credential!: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  label!: string;

  @Prop({ trim: true, type: String })
  description?: string;

  @Prop({
    enum: Object.values(CampaignPlatform),
    required: true,
    type: String,
  })
  platform!: CampaignPlatform;

  @Prop({
    enum: Object.values(CampaignType),
    required: true,
    type: String,
  })
  campaignType!: CampaignType;

  @Prop({
    default: CampaignStatus.DRAFT,
    enum: Object.values(CampaignStatus),
    type: String,
  })
  status!: CampaignStatus;

  @Prop({ default: {}, type: OutreachCampaignDiscoveryConfig })
  discoveryConfig?: OutreachCampaignDiscoveryConfig;

  @Prop({ default: {}, type: OutreachCampaignAiConfig })
  aiConfig?: OutreachCampaignAiConfig;

  @Prop({ default: {}, type: OutreachCampaignDmConfig })
  dmConfig?: OutreachCampaignDmConfig;

  @Prop({ default: {}, type: OutreachCampaignRateLimits })
  rateLimits!: OutreachCampaignRateLimits;

  @Prop({ default: {}, type: OutreachCampaignSchedule })
  schedule?: OutreachCampaignSchedule;

  @Prop({ default: 0, type: Number })
  totalTargets!: number;

  @Prop({ default: 0, type: Number })
  totalReplies!: number;

  @Prop({ default: 0, type: Number })
  totalSuccessful!: number;

  @Prop({ default: 0, type: Number })
  totalFailed!: number;

  @Prop({ default: 0, type: Number })
  totalSkipped!: number;

  @Prop({ default: 0, type: Number })
  totalDmsSent!: number;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  lastActivityAt?: Date;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CampaignDiscoveryConfigSchema = SchemaFactory.createForClass(
  OutreachCampaignDiscoveryConfig,
);
export const CampaignAiConfigSchema = SchemaFactory.createForClass(
  OutreachCampaignAiConfig,
);
export const CampaignRateLimitsSchema = SchemaFactory.createForClass(
  OutreachCampaignRateLimits,
);
export const CampaignScheduleSchema = SchemaFactory.createForClass(
  OutreachCampaignSchedule,
);
export const CampaignDmConfigSchema = SchemaFactory.createForClass(
  OutreachCampaignDmConfig,
);
export const OutreachCampaignSchema =
  SchemaFactory.createForClass(OutreachCampaign);
