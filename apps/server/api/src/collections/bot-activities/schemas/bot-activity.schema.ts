import {
  BotActivitySkipReason,
  BotActivityStatus,
  ReplyBotActionType,
  ReplyBotType,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type BotActivityDocument = BotActivity & Document;

/**
 * Twitter user info for the activity
 */
@Schema({ _id: false })
export class BotActivityTwitterUser {
  @Prop({ required: true, type: String })
  userId!: string;

  @Prop({ required: true, type: String })
  username!: string;

  @Prop({ type: String })
  displayName?: string;

  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({ type: Number })
  followersCount?: number;
}

/**
 * Engagement metrics for the reply tweet
 */
@Schema({ _id: false })
export class BotActivityEngagement {
  @Prop({ default: 0, type: Number })
  impressions!: number;

  @Prop({ default: 0, type: Number })
  likes!: number;

  @Prop({ default: 0, type: Number })
  retweets!: number;

  @Prop({ default: 0, type: Number })
  replies!: number;

  @Prop({ type: Date })
  updatedAt?: Date;
}

/**
 * Bot Activity Schema
 *
 * Logs every action taken by the reply bot system.
 * This includes successful replies, DMs sent, and skipped/failed actions.
 */
@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'bot-activities',
  timestamps: true,
  versionKey: false,
})
export class BotActivity {
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
    ref: 'ReplyBotConfig',
    required: true,
    type: Types.ObjectId,
  })
  replyBotConfig!: Types.ObjectId;

  @Prop({ index: true, ref: 'MonitoredAccount', type: Types.ObjectId })
  monitoredAccount?: Types.ObjectId;

  @Prop({
    enum: Object.values(ReplyBotType),
    index: true,
    required: true,
    type: String,
  })
  botType!: ReplyBotType;

  @Prop({
    enum: Object.values(ReplyBotActionType),
    required: true,
    type: String,
  })
  actionType!: ReplyBotActionType;

  @Prop({
    default: BotActivityStatus.PENDING,
    enum: Object.values(BotActivityStatus),
    type: String,
  })
  status!: BotActivityStatus;

  @Prop({
    enum: Object.values(BotActivitySkipReason),
    type: String,
  })
  skipReason?: BotActivitySkipReason;

  @Prop({ required: true, type: String })
  triggerTweetId!: string;

  @Prop({ required: true, type: String })
  triggerTweetText!: string;

  @Prop({ type: String })
  triggerTweetUrl?: string;

  @Prop({ required: true, type: BotActivityTwitterUser })
  triggerTweetAuthor!: BotActivityTwitterUser;

  @Prop({ type: String })
  replyTweetId?: string;

  @Prop({ type: String })
  replyTweetText?: string;

  @Prop({ type: String })
  replyTweetUrl?: string;

  @Prop({ type: BotActivityEngagement })
  replyEngagement?: BotActivityEngagement;

  @Prop({ default: false, type: Boolean })
  dmSent!: boolean;

  @Prop({ type: String })
  dmText?: string;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: Object })
  errorDetails?: Record<string, unknown>;

  @Prop({ default: 0, type: Number })
  retryCount!: number;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ type: Number })
  processingDurationMs?: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const BotActivityTwitterUserSchema = SchemaFactory.createForClass(
  BotActivityTwitterUser,
);
export const BotActivityEngagementSchema = SchemaFactory.createForClass(
  BotActivityEngagement,
);
export const BotActivitySchema = SchemaFactory.createForClass(BotActivity);
