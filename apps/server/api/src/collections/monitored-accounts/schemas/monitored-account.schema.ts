import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type MonitoredAccountDocument = MonitoredAccount & Document;

/**
 * Keyword filters for monitoring
 */
@Schema({ _id: false })
export class MonitoredAccountKeywordFilters {
  @Prop({ default: [], type: [String] })
  include!: string[];

  @Prop({ default: [], type: [String] })
  exclude!: string[];
}

/**
 * Hashtag filters for monitoring
 */
@Schema({ _id: false })
export class MonitoredAccountHashtagFilters {
  @Prop({ default: [], type: [String] })
  include!: string[];

  @Prop({ default: [], type: [String] })
  exclude!: string[];
}

/**
 * Minimum engagement thresholds
 */
@Schema({ _id: false })
export class MonitoredAccountEngagementThresholds {
  @Prop({ default: 0, type: Number })
  minRetweets!: number;

  @Prop({ default: 0, type: Number })
  minLikes!: number;

  @Prop({ default: 0, type: Number })
  minReplies!: number;
}

/**
 * Filter configuration for monitored accounts
 */
@Schema({ _id: false })
export class MonitoredAccountFilters {
  @Prop({ default: {}, type: MonitoredAccountKeywordFilters })
  keywords?: MonitoredAccountKeywordFilters;

  @Prop({ default: {}, type: MonitoredAccountHashtagFilters })
  hashtags?: MonitoredAccountHashtagFilters;

  @Prop({
    default: 'all',
    enum: ['all', 'text-only', 'images', 'videos'],
    type: String,
  })
  mediaType?: string;

  @Prop({ default: {}, type: MonitoredAccountEngagementThresholds })
  minEngagement?: MonitoredAccountEngagementThresholds;
}

/**
 * Monitored Account Schema
 *
 * Represents a Twitter/X account being monitored for the reply bot system.
 * When the monitored account tweets, the bot can auto-reply.
 */
@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'monitored-accounts',
  timestamps: true,
  versionKey: false,
})
export class MonitoredAccount {
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

  @Prop({ index: true, ref: 'Credential', type: Types.ObjectId })
  credential?: Types.ObjectId;

  @Prop({ ref: 'ReplyBotConfig', type: Types.ObjectId })
  botConfig?: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  twitterUsername!: string;

  @Prop({ required: true, type: String })
  twitterUserId!: string;

  @Prop({ trim: true, type: String })
  twitterDisplayName?: string;

  @Prop({ type: String })
  twitterAvatarUrl?: string;

  @Prop({ type: String })
  twitterBio?: string;

  @Prop({ default: 0, type: Number })
  twitterFollowersCount?: number;

  @Prop({ default: {}, type: MonitoredAccountFilters })
  filters?: MonitoredAccountFilters;

  @Prop({ type: String })
  lastCheckedTweetId?: string;

  @Prop({ type: Date })
  lastCheckedAt?: Date;

  @Prop({ type: String })
  lastProcessedTweetId?: string;

  @Prop({ type: Date })
  lastProcessedAt?: Date;

  @Prop({ default: 0, type: Number })
  tweetsProcessedCount?: number;

  @Prop({ default: 0, type: Number })
  repliesSentCount?: number;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const MonitoredAccountKeywordFiltersSchema =
  SchemaFactory.createForClass(MonitoredAccountKeywordFilters);
export const MonitoredAccountHashtagFiltersSchema =
  SchemaFactory.createForClass(MonitoredAccountHashtagFilters);
export const MonitoredAccountEngagementThresholdsSchema =
  SchemaFactory.createForClass(MonitoredAccountEngagementThresholds);
export const MonitoredAccountFiltersSchema = SchemaFactory.createForClass(
  MonitoredAccountFilters,
);
export const MonitoredAccountSchema =
  SchemaFactory.createForClass(MonitoredAccount);
