import { BotPlatform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type LivestreamBotSessionDocument = LivestreamBotSession & Document;

const LIVESTREAM_MESSAGE_TYPES = [
  'scheduled_link_drop',
  'scheduled_host_prompt',
  'context_aware_question',
] as const;

const LIVESTREAM_SESSION_STATUSES = ['active', 'paused', 'stopped'] as const;

const LIVESTREAM_DELIVERY_STATUSES = ['sent', 'skipped', 'failed'] as const;

@Schema({ _id: false })
export class LivestreamManualOverride {
  @Prop({ required: false, trim: true, type: String })
  topic?: string;

  @Prop({ required: false, trim: true, type: String })
  promotionAngle?: string;

  @Prop({ required: false, trim: true, type: String })
  activeLinkId?: string;

  @Prop({ required: false, type: Date })
  expiresAt?: Date;
}

@Schema({ _id: false })
export class LivestreamContextState {
  @Prop({ required: false, trim: true, type: String })
  currentTopic?: string;

  @Prop({ required: false, trim: true, type: String })
  promotionAngle?: string;

  @Prop({ required: false, trim: true, type: String })
  transcriptSummary?: string;

  @Prop({ required: false, type: Number })
  transcriptConfidence?: number;

  @Prop({ required: false, trim: true, type: String })
  source?: 'manual_override' | 'transcript' | 'none';

  @Prop({ type: LivestreamManualOverride })
  manualOverride?: LivestreamManualOverride;
}

@Schema({ _id: false })
export class LivestreamTranscriptChunk {
  @Prop({ required: true, trim: true, type: String })
  text!: string;

  @Prop({ required: false, type: Number })
  confidence?: number;

  @Prop({ default: Date.now, type: Date })
  createdAt?: Date;
}

@Schema({ _id: false })
export class LivestreamPlatformState {
  @Prop({
    enum: [BotPlatform.TWITCH, BotPlatform.YOUTUBE],
    required: true,
    type: String,
  })
  platform!: BotPlatform;

  @Prop({ required: false, type: Date })
  lastPostedAt?: Date;

  @Prop({ required: false, type: Date })
  hourWindowStartedAt?: Date;

  @Prop({ default: 0, type: Number })
  hourlyPostCount?: number;

  @Prop({ required: false, trim: true, type: String })
  lastError?: string;
}

@Schema({ _id: false })
export class LivestreamDeliveryRecord {
  @Prop({ required: true, trim: true, type: String })
  id!: string;

  @Prop({
    enum: [BotPlatform.TWITCH, BotPlatform.YOUTUBE],
    required: true,
    type: String,
  })
  platform!: BotPlatform;

  @Prop({
    enum: LIVESTREAM_MESSAGE_TYPES,
    required: true,
    type: String,
  })
  type!: (typeof LIVESTREAM_MESSAGE_TYPES)[number];

  @Prop({
    enum: LIVESTREAM_DELIVERY_STATUSES,
    required: true,
    type: String,
  })
  status!: (typeof LIVESTREAM_DELIVERY_STATUSES)[number];

  @Prop({ required: true, trim: true, type: String })
  message!: string;

  @Prop({ required: false, trim: true, type: String })
  reason?: string;

  @Prop({ required: false, trim: true, type: String })
  targetId?: string;

  @Prop({ default: Date.now, type: Date })
  createdAt?: Date;
}

@Schema({
  collection: 'livestream-bot-sessions',
  timestamps: true,
  versionKey: false,
})
export class LivestreamBotSession {
  @Prop({ ref: 'Bot', required: true, type: Types.ObjectId })
  bot!: Types.ObjectId;

  @Prop({ ref: 'Organization', required: false, type: Types.ObjectId })
  organization?: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ ref: 'User', required: false, type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({
    default: 'stopped',
    enum: LIVESTREAM_SESSION_STATUSES,
    type: String,
  })
  status!: (typeof LIVESTREAM_SESSION_STATUSES)[number];

  @Prop({ default: {}, type: LivestreamContextState })
  context?: LivestreamContextState;

  @Prop({ default: [], type: [LivestreamTranscriptChunk] })
  transcriptChunks?: LivestreamTranscriptChunk[];

  @Prop({ default: [], type: [LivestreamPlatformState] })
  platformStates?: LivestreamPlatformState[];

  @Prop({ default: [], type: [LivestreamDeliveryRecord] })
  deliveryHistory?: LivestreamDeliveryRecord[];

  @Prop({ required: false, type: Date })
  startedAt?: Date;

  @Prop({ required: false, type: Date })
  pausedAt?: Date;

  @Prop({ required: false, type: Date })
  stoppedAt?: Date;

  @Prop({ required: false, type: Date })
  lastTranscriptAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const LivestreamManualOverrideSchema = SchemaFactory.createForClass(
  LivestreamManualOverride,
);
export const LivestreamContextStateSchema = SchemaFactory.createForClass(
  LivestreamContextState,
);
export const LivestreamTranscriptChunkSchema = SchemaFactory.createForClass(
  LivestreamTranscriptChunk,
);
export const LivestreamPlatformStateSchema = SchemaFactory.createForClass(
  LivestreamPlatformState,
);
export const LivestreamDeliveryRecordSchema = SchemaFactory.createForClass(
  LivestreamDeliveryRecord,
);
export const LivestreamBotSessionSchema =
  SchemaFactory.createForClass(LivestreamBotSession);
