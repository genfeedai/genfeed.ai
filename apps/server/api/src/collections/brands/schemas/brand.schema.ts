import { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import {
  AssetScope,
  FontFamily,
  ReferenceImageCategory,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type BrandDocument = Brand & Document;

@Schema({ _id: false })
export class BrandAgentVoice {
  @Prop({ required: false, type: String })
  tone?: string;

  @Prop({ required: false, type: String })
  style?: string;

  @Prop({ default: [], type: [String] })
  audience!: string[];

  @Prop({ default: [], type: [String] })
  values!: string[];

  @Prop({ default: [], type: [String] })
  taglines!: string[];

  @Prop({ default: [], type: [String] })
  hashtags!: string[];

  @Prop({ default: [], type: [String] })
  messagingPillars!: string[];

  @Prop({ default: [], type: [String] })
  doNotSoundLike!: string[];

  @Prop({ required: false, type: String })
  sampleOutput?: string;
}

@Schema({ _id: false })
export class BrandAgentStrategy {
  @Prop({ default: [], type: [String] })
  contentTypes!: string[];

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  @Prop({ required: false, type: String })
  frequency?: string;

  @Prop({ default: [], type: [String] })
  goals!: string[];
}

@Schema({ _id: false })
export class BrandAgentPlatformOverride {
  @Prop({
    default: () => ({}),
    type: BrandAgentVoice,
  })
  voice?: BrandAgentVoice;

  @Prop({
    default: () => ({}),
    type: BrandAgentStrategy,
  })
  strategy?: BrandAgentStrategy;

  @Prop({ required: false, type: String })
  defaultModel?: string;

  @Prop({ required: false, type: String })
  persona?: string;
}

const BrandAgentPlatformOverrideSchema = SchemaFactory.createForClass(
  BrandAgentPlatformOverride,
);

@Schema({ _id: false })
export class BrandAgentSchedule {
  @Prop({ required: false, type: String })
  cronExpression?: string;

  @Prop({ default: 'UTC', type: String })
  timezone!: string;

  @Prop({ default: false, type: Boolean })
  enabled!: boolean;
}

@Schema({ _id: false })
export class BrandAgentAutoPublish {
  @Prop({ default: false, type: Boolean })
  enabled!: boolean;

  @Prop({ default: 0.8, max: 1, min: 0, type: Number })
  confidenceThreshold!: number;
}

@Schema({ _id: false })
export class BrandAgentConfig {
  @Prop({
    default: [],
    type: [String],
  })
  enabledSkills!: string[];

  @Prop({
    default: () => ({}),
    type: BrandAgentVoice,
  })
  voice?: BrandAgentVoice;

  @Prop({
    default: () => ({}),
    type: BrandAgentStrategy,
  })
  strategy?: BrandAgentStrategy;

  @Prop({
    default: () => ({ enabled: false, timezone: 'UTC' }),
    type: BrandAgentSchedule,
  })
  schedule?: BrandAgentSchedule;

  @Prop({
    default: () => ({ confidenceThreshold: 0.8, enabled: false }),
    type: BrandAgentAutoPublish,
  })
  autoPublish?: BrandAgentAutoPublish;

  @Prop({ required: false, type: String })
  defaultModel?: string;

  @Prop({
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  defaultVoiceId?: Types.ObjectId;

  @Prop({
    required: false,
    type: DefaultVoiceRef,
  })
  defaultVoiceRef?: DefaultVoiceRef;

  @Prop({ required: false, type: String })
  defaultAvatarPhotoUrl?: string;

  @Prop({
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  defaultAvatarIngredientId?: Types.ObjectId;

  // HeyGen facecam defaults (used by workspace composer to pre-select
  // avatar + voice when the user picks the Facecam output type).
  @Prop({ required: false, type: String })
  heygenAvatarId?: string;

  @Prop({ required: false, type: String })
  heygenVoiceId?: string;

  @Prop({ required: false, type: String })
  persona?: string;

  @Prop({
    default: {},
    of: BrandAgentPlatformOverrideSchema,
    type: Map,
  })
  platformOverrides?: Map<string, BrandAgentPlatformOverride>;
}

@Schema({ _id: false })
export class BrandReferenceImage {
  @Prop({ required: true, type: String })
  url!: string;

  @Prop({
    enum: Object.values(ReferenceImageCategory),
    required: true,
    type: String,
  })
  category!: ReferenceImageCategory;

  @Prop({ required: false, type: String })
  label?: string;

  @Prop({ default: false, type: Boolean })
  isDefault?: boolean;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'brands',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Brand {
  _id!: string;

  @Prop({
    ref: 'User',
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
    ref: 'Ingredient',
    type: Types.ObjectId,
  })
  voice?: Types.ObjectId;

  @Prop({
    ref: 'Ingredient',
    type: Types.ObjectId,
  })
  music?: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    unique: true,
  })
  slug!: string;

  @Prop({
    required: true,
    type: String,
  })
  label!: string;

  @Prop({
    required: false,
    type: String,
  })
  description!: string;

  @Prop({
    required: false,
    type: String,
  })
  text?: string;

  @Prop({
    default: FontFamily.MONTSERRAT_BLACK,
    enum: Object.values(FontFamily),
    required: true,
    type: String,
  })
  fontFamily!: string;

  @Prop({
    default: '#000000',
    required: true,
    type: String,
  })
  primaryColor!: string;

  @Prop({
    default: '#FFFFFF',
    required: true,
    type: String,
  })
  secondaryColor!: string;

  @Prop({
    default: 'transparent',
    required: true,
    type: String,
  })
  backgroundColor!: string;

  @Prop({
    default: [],
    type: [BrandReferenceImage],
  })
  referenceImages!: BrandReferenceImage[];

  @Prop({
    required: true,
    type: Boolean,
  })
  isSelected!: boolean;

  @Prop({
    default: AssetScope.USER,
    enum: Object.values(AssetScope),
    type: String,
  })
  scope!: AssetScope;

  // Indicates if the brand is active and should be billed monthly
  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean, index: true })
  isDefault!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: false, type: Boolean })
  isHighlighted!: boolean;

  @Prop({ default: false, type: Boolean })
  isDarkroomEnabled!: boolean;

  // Default models for different media types
  @Prop({
    type: String,
    default: null,
  })
  defaultVideoModel?: string;

  @Prop({
    type: String,
    default: null,
  })
  defaultImageModel?: string;

  @Prop({
    type: String,
    default: null,
  })
  defaultImageToVideoModel?: string;

  @Prop({
    type: String,
    default: null,
  })
  defaultMusicModel?: string;

  @Prop({
    default: () => ({ enabledSkills: [] }),
    type: BrandAgentConfig,
  })
  agentConfig!: BrandAgentConfig;

  // Virtual fields - populated from assets collection
  logo?: Types.ObjectId;
  banner?: Types.ObjectId;
  references?: Types.ObjectId[];
}

export const BrandSchema = SchemaFactory.createForClass(Brand);
