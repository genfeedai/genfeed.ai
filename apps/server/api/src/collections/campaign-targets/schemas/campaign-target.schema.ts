import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignSkipReason,
  CampaignTargetStatus,
  CampaignTargetType,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CampaignTargetDocument = CampaignTarget & Document;

/**
 * Campaign Target Schema
 *
 * Stores individual targets (tweets, Reddit posts) for a campaign.
 * Tracks status, reply content, and processing metadata.
 */
@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'campaign-targets',
  timestamps: true,
  versionKey: false,
})
export class CampaignTarget {
  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'OutreachCampaign',
    required: true,
    type: Types.ObjectId,
  })
  campaign!: Types.ObjectId;

  @Prop({
    enum: Object.values(CampaignPlatform),
    required: true,
    type: String,
  })
  platform!: CampaignPlatform;

  @Prop({
    enum: Object.values(CampaignTargetType),
    required: true,
    type: String,
  })
  targetType!: CampaignTargetType;

  @Prop({ required: true, trim: true, type: String })
  externalId!: string;

  @Prop({ required: true, trim: true, type: String })
  contentUrl!: string;

  @Prop({ trim: true, type: String })
  authorUsername?: string;

  @Prop({ trim: true, type: String })
  authorId?: string;

  @Prop({ trim: true, type: String })
  contentText?: string;

  @Prop({ type: Date })
  contentCreatedAt?: Date;

  @Prop({ default: 0, type: Number })
  likes?: number;

  @Prop({ default: 0, type: Number })
  retweets?: number;

  @Prop({ default: 0, type: Number })
  replies?: number;

  @Prop({
    default: CampaignDiscoverySource.MANUAL,
    enum: Object.values(CampaignDiscoverySource),
    type: String,
  })
  discoverySource!: CampaignDiscoverySource;

  @Prop({ default: 0, max: 1, min: 0, type: Number })
  relevanceScore!: number;

  @Prop({ trim: true, type: String })
  matchedKeyword?: string;

  @Prop({
    default: CampaignTargetStatus.PENDING,
    enum: Object.values(CampaignTargetStatus),
    index: true,
    type: String,
  })
  status!: CampaignTargetStatus;

  @Prop({ index: true, type: Date })
  scheduledAt?: Date;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ trim: true, type: String })
  replyText?: string;

  @Prop({ trim: true, type: String })
  replyExternalId?: string;

  @Prop({ trim: true, type: String })
  replyUrl?: string;

  @Prop({ trim: true, type: String })
  errorMessage?: string;

  @Prop({
    enum: Object.values(CampaignSkipReason),
    type: String,
  })
  skipReason?: CampaignSkipReason;

  @Prop({ default: 0, type: Number })
  retryCount!: number;

  @Prop({ trim: true, type: String })
  recipientUsername?: string;

  @Prop({ trim: true, type: String })
  recipientUserId?: string;

  @Prop({ trim: true, type: String })
  dmText?: string;

  @Prop({ type: Date })
  dmSentAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CampaignTargetSchema =
  SchemaFactory.createForClass(CampaignTarget);
