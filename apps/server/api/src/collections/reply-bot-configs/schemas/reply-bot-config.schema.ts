import {
  ReplyBotActionType,
  ReplyBotType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ReplyBotConfigDocument = ReplyBotConfig & Document;

/**
 * Rate limit configuration for reply bot
 */
@Schema({ _id: false })
export class ReplyBotRateLimits {
  @Prop({ default: 10, max: 50, min: 1, type: Number })
  maxRepliesPerHour!: number;

  @Prop({ default: 50, max: 200, min: 1, type: Number })
  maxRepliesPerDay!: number;

  @Prop({ default: 5, max: 20, min: 1, type: Number })
  maxRepliesPerAccountPerDay!: number;

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
 * Schedule configuration for when the bot is active
 */
@Schema({ _id: false })
export class ReplyBotSchedule {
  @Prop({ default: false, type: Boolean })
  enabled!: boolean;

  @Prop({ default: '09:00', type: String })
  startTime?: string;

  @Prop({ default: '09:00', type: String })
  activeHoursStart?: string;

  @Prop({ default: '17:00', type: String })
  endTime?: string;

  @Prop({ default: '17:00', type: String })
  activeHoursEnd?: string;

  @Prop({ default: 'America/Los_Angeles', type: String })
  timezone?: string;

  @Prop({
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    type: [String],
  })
  activeDays?: string[];
}

/**
 * DM configuration when bot sends direct messages
 */
@Schema({ _id: false })
export class ReplyBotDmConfig {
  @Prop({ default: false, type: Boolean })
  enabled!: boolean;

  @Prop({ trim: true, type: String })
  template?: string;

  @Prop({ default: true, type: Boolean })
  useAiGeneration!: boolean;

  @Prop({ default: 60, type: Number })
  delaySeconds?: number;

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
 * Keyword and audience filters for comment processing
 */
@Schema({ _id: false })
export class ReplyBotFilters {
  @Prop({ default: [], type: [String] })
  includeKeywords!: string[];

  @Prop({ default: [], type: [String] })
  excludeKeywords!: string[];

  @Prop({ default: 0, min: 0, type: Number })
  minFollowers?: number;
}

/**
 * Reply Bot Configuration Schema
 *
 * Stores the configuration for a reply bot instance.
 * Each config can be either a REPLY_GUY (reply to users who reply to your tweets)
 * or ACCOUNT_MONITOR (watch specific accounts and reply when they tweet).
 */
@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'reply-bot-configs',
  timestamps: true,
  versionKey: false,
})
export class ReplyBotConfig {
  _id!: Types.ObjectId;
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
    index: true,
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
    enum: Object.values(ReplyBotType),
    required: true,
    type: String,
  })
  type!: ReplyBotType;

  @Prop({
    default: ReplyBotActionType.REPLY_ONLY,
    enum: Object.values(ReplyBotActionType),
    type: String,
  })
  actionType!: ReplyBotActionType;

  @Prop({
    default: ReplyTone.FRIENDLY,
    enum: Object.values(ReplyTone),
    type: String,
  })
  replyTone!: ReplyTone;

  @Prop({
    default: ReplyLength.MEDIUM,
    enum: Object.values(ReplyLength),
    type: String,
  })
  replyLength!: ReplyLength;

  @Prop({ trim: true, type: String })
  customInstructions?: string;

  @Prop({ trim: true, type: String })
  context?: string;

  @Prop({ default: {}, type: ReplyBotDmConfig })
  dmConfig?: ReplyBotDmConfig;

  @Prop({ default: {}, type: ReplyBotRateLimits })
  rateLimits!: ReplyBotRateLimits;

  @Prop({ default: {}, type: ReplyBotSchedule })
  schedule?: ReplyBotSchedule;

  @Prop({ default: {}, type: ReplyBotFilters })
  filters?: ReplyBotFilters;

  @Prop({
    default: [],
    type: [{ ref: 'MonitoredAccount', type: Types.ObjectId }],
  })
  monitoredAccounts?: Types.ObjectId[];

  @Prop({ default: 0, type: Number })
  totalRepliesSent?: number;

  @Prop({ default: 0, type: Number })
  totalDmsSent?: number;

  @Prop({ default: 0, type: Number })
  totalSkipped?: number;

  @Prop({ default: 0, type: Number })
  totalFailed?: number;

  @Prop({ type: Date })
  lastActivityAt?: Date;

  @Prop({ type: String })
  lastProcessedTweetId?: string;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ReplyBotRateLimitsSchema =
  SchemaFactory.createForClass(ReplyBotRateLimits);
export const ReplyBotScheduleSchema =
  SchemaFactory.createForClass(ReplyBotSchedule);
export const ReplyBotDmConfigSchema =
  SchemaFactory.createForClass(ReplyBotDmConfig);
export const ReplyBotFiltersSchema =
  SchemaFactory.createForClass(ReplyBotFilters);
export const ReplyBotConfigSchema =
  SchemaFactory.createForClass(ReplyBotConfig);
