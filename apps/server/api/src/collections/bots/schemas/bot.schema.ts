import { BotCategory, BotPlatform, BotStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type BotDocument = Bot & Document;

const LIVESTREAM_MESSAGE_TYPES = [
  'scheduled_link_drop',
  'scheduled_host_prompt',
  'context_aware_question',
] as const;

const LIVESTREAM_TARGET_AUDIENCES = ['hosts', 'audience'] as const;

@Schema({ _id: false })
export class BotTarget {
  @Prop({
    enum: Object.values(BotPlatform),
    required: true,
    type: String,
  })
  platform!: BotPlatform;

  @Prop({ required: true, type: String })
  channelId!: string;

  @Prop({ required: false, type: String })
  channelLabel?: string;

  @Prop({ required: false, type: String })
  channelUrl?: string;

  @Prop({ ref: 'Credential', required: false, type: Types.ObjectId })
  credentialId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  liveChatId?: string;

  @Prop({ required: false, type: String })
  senderId?: string;

  @Prop({ default: true, type: Boolean })
  isEnabled?: boolean;
}

@Schema({ _id: false })
export class BotResponseTemplate {
  @Prop({ required: true, trim: true, type: String })
  trigger!: string;

  @Prop({ required: true, trim: true, type: String })
  response!: string;
}

@Schema({ _id: false })
export class BotSettings {
  @Prop({ default: 10, max: 60, min: 0, type: Number })
  messagesPerMinute?: number;

  @Prop({ default: 5, max: 3600, min: 0, type: Number })
  responseDelaySeconds?: number;

  @Prop({ default: [], type: [String] })
  triggers?: string[];

  @Prop({ default: [], type: [BotResponseTemplate] })
  responses?: BotResponseTemplate[];
}

@Schema({ _id: false })
export class BotLivestreamLink {
  @Prop({ required: true, trim: true, type: String })
  id!: string;

  @Prop({ required: true, trim: true, type: String })
  label!: string;

  @Prop({ required: true, trim: true, type: String })
  url!: string;
}

@Schema({ _id: false })
export class BotLivestreamMessageTemplate {
  @Prop({ default: true, type: Boolean })
  enabled?: boolean;

  @Prop({ required: true, trim: true, type: String })
  id!: string;

  @Prop({
    default: [],
    enum: [BotPlatform.TWITCH, BotPlatform.YOUTUBE],
    type: [String],
  })
  platforms?: BotPlatform[];

  @Prop({ required: true, trim: true, type: String })
  text!: string;

  @Prop({
    enum: LIVESTREAM_MESSAGE_TYPES,
    required: true,
    type: String,
  })
  type!: (typeof LIVESTREAM_MESSAGE_TYPES)[number];
}

@Schema({ _id: false })
export class BotLivestreamSettings {
  @Prop({ default: true, type: Boolean })
  automaticPosting?: boolean;

  @Prop({ default: [], type: [BotLivestreamLink] })
  links?: BotLivestreamLink[];

  @Prop({ default: 15, max: 120, min: 1, type: Number })
  manualOverrideTtlMinutes?: number;

  @Prop({ default: 6, max: 60, min: 1, type: Number })
  maxAutoPostsPerHour?: number;

  @Prop({ default: [], type: [BotLivestreamMessageTemplate] })
  messageTemplates?: BotLivestreamMessageTemplate[];

  @Prop({ default: 90, max: 600, min: 15, type: Number })
  minimumMessageGapSeconds?: number;

  @Prop({ default: true, type: Boolean })
  prioritizeYoutube?: boolean;

  @Prop({ default: 10, max: 120, min: 1, type: Number })
  scheduledCadenceMinutes?: number;

  @Prop({
    default: ['audience'],
    enum: LIVESTREAM_TARGET_AUDIENCES,
    type: [String],
  })
  targetAudience?: (typeof LIVESTREAM_TARGET_AUDIENCES)[number][];

  @Prop({ default: true, type: Boolean })
  transcriptEnabled?: boolean;

  @Prop({ default: 3, max: 10, min: 1, type: Number })
  transcriptLookbackMinutes?: number;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'bots',
  timestamps: true,
  versionKey: false,
})
export class Bot {
  @Prop({ required: true, trim: true, type: String })
  label!: string;

  @Prop({ trim: true, type: String })
  description?: string;

  @Prop({
    default: BotCategory.CHAT,
    enum: Object.values(BotCategory),
    required: true,
    type: String,
  })
  category!: BotCategory;

  @Prop({
    default: BotStatus.ACTIVE,
    enum: Object.values(BotStatus),
    type: String,
  })
  status!: BotStatus;

  @Prop({
    default: [BotPlatform.TWITTER],
    enum: Object.values(BotPlatform),
    type: [String],
  })
  platforms!: BotPlatform[];

  @Prop({ default: [], type: [BotTarget] })
  targets?: BotTarget[];

  @Prop({ default: {}, type: BotSettings })
  settings?: BotSettings;

  @Prop({ default: {}, type: BotLivestreamSettings })
  livestreamSettings?: BotLivestreamSettings;

  @Prop({ ref: 'Organization', required: false, type: Types.ObjectId })
  organization?: Types.ObjectId;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ ref: 'User', required: false, type: Types.ObjectId })
  user?: Types.ObjectId;

  @Prop({ default: 0, type: Number })
  messagesCount?: number;

  @Prop({ default: 0, type: Number })
  engagementsCount?: number;

  @Prop({ type: Date })
  lastActiveAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const BotTargetSchema = SchemaFactory.createForClass(BotTarget);
export const BotResponseTemplateSchema =
  SchemaFactory.createForClass(BotResponseTemplate);
export const BotSettingsSchema = SchemaFactory.createForClass(BotSettings);
export const BotLivestreamLinkSchema =
  SchemaFactory.createForClass(BotLivestreamLink);
export const BotLivestreamMessageTemplateSchema = SchemaFactory.createForClass(
  BotLivestreamMessageTemplate,
);
export const BotLivestreamSettingsSchema = SchemaFactory.createForClass(
  BotLivestreamSettings,
);
export const BotSchema = SchemaFactory.createForClass(Bot);
