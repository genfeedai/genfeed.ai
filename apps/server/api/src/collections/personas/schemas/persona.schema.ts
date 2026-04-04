import {
  AvatarProvider,
  ContentIntelligencePlatform,
  LoraStatus,
  PersonaContentFormat,
  PersonaStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type PersonaDocument = Persona & Document;

@Schema({
  _id: false,
  versionKey: false,
})
export class PersonaContentStrategy {
  @Prop({ required: false, type: [String] })
  topics?: string[];

  @Prop({ required: false, type: String })
  tone?: string;

  @Prop({
    enum: Object.values(PersonaContentFormat),
    required: false,
    type: [String],
  })
  formats?: PersonaContentFormat[];

  @Prop({ required: false, type: String })
  frequency?: string;

  @Prop({ required: false, type: [String] })
  platforms?: string[];
}

export const PersonaContentStrategySchema = SchemaFactory.createForClass(
  PersonaContentStrategy,
);

@Schema({
  _id: false,
  versionKey: false,
})
export class PersonaDarkroomSource {
  @Prop({
    enum: Object.values(ContentIntelligencePlatform),
    required: true,
    type: String,
  })
  platform!: ContentIntelligencePlatform;

  @Prop({ required: true, type: String })
  handle!: string;

  @Prop({ required: false, type: String })
  profileUrl?: string;

  @Prop({ default: true, type: Boolean })
  enabled!: boolean;

  @Prop({ default: false, type: Boolean })
  isPrimary!: boolean;

  @Prop({ required: false, type: Date })
  lastIngestedAt?: Date;
}

export const PersonaDarkroomSourceSchema = SchemaFactory.createForClass(
  PersonaDarkroomSource,
);

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'personas',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Persona {
  @Prop({
    ref: 'User',
    required: true,
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
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  handle?: string;

  @Prop({ required: false, type: String })
  bio?: string;

  @Prop({ required: false, type: String })
  profileImageUrl?: string;

  @Prop({
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  avatar?: Types.ObjectId;

  @Prop({
    enum: Object.values(AvatarProvider),
    required: false,
    type: String,
  })
  avatarProvider?: AvatarProvider;

  @Prop({ required: false, type: String })
  avatarExternalId?: string;

  @Prop({
    ref: 'Voice',
    required: false,
    type: Types.ObjectId,
  })
  voice?: Types.ObjectId;

  @Prop({
    enum: Object.values(VoiceProvider),
    required: false,
    type: String,
  })
  voiceProvider?: VoiceProvider;

  @Prop({ required: false, type: String })
  voiceExternalId?: string;

  @Prop({
    required: false,
    type: PersonaContentStrategySchema,
  })
  contentStrategy?: PersonaContentStrategy;

  @Prop({
    ref: 'Credential',
    required: false,
    type: [Types.ObjectId],
  })
  credentials?: Types.ObjectId[];

  @Prop({
    ref: 'User',
    required: false,
    type: [Types.ObjectId],
  })
  assignedMembers?: Types.ObjectId[];

  @Prop({
    default: PersonaStatus.DRAFT,
    enum: Object.values(PersonaStatus),
    required: true,
    type: String,
  })
  status!: PersonaStatus;

  @Prop({
    ref: 'Tag',
    required: false,
    type: [Types.ObjectId],
  })
  tags?: Types.ObjectId[];

  // === Darkroom fields (all optional, no migration risk) ===

  @Prop({
    index: true,
    required: false,
    sparse: true,
    type: String,
    unique: true,
  })
  slug?: string;

  @Prop({ required: false, type: String })
  skinTone?: string;

  @Prop({ required: false, type: String })
  eyeColor?: string;

  @Prop({ required: false, type: String })
  triggerWord?: string;

  @Prop({ required: false, type: String })
  s3Folder?: string;

  @Prop({
    default: LoraStatus.NONE,
    enum: Object.values(LoraStatus),
    required: false,
    type: String,
  })
  loraStatus?: LoraStatus;

  @Prop({ required: false, type: String })
  loraModelPath?: string;

  @Prop({ required: false, type: String })
  niche?: string;

  @Prop({ required: false, type: String })
  emoji?: string;

  @Prop({ required: false, type: String })
  personaFileS3Key?: string;

  @Prop({ default: false, required: false, type: Boolean })
  isDarkroomCharacter?: boolean;

  @Prop({
    default: [],
    required: false,
    type: [PersonaDarkroomSourceSchema],
  })
  darkroomSources?: PersonaDarkroomSource[];

  // === Autopilot fields ===

  @Prop({ default: false, type: Boolean })
  isAutopilotEnabled?: boolean;

  @Prop({ required: false, type: Date })
  lastAutopilotRunAt?: Date;

  @Prop({ required: false, type: Date })
  nextAutopilotRunAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PersonaSchema = SchemaFactory.createForClass(Persona);

PersonaSchema.index(
  { isDeleted: 1, organization: 1, status: 1 },
  { name: 'idx_org_status', partialFilterExpression: { isDeleted: false } },
);

PersonaSchema.index(
  { brand: 1, isDeleted: 1, organization: 1 },
  { name: 'idx_brand_org', partialFilterExpression: { isDeleted: false } },
);

PersonaSchema.index(
  { assignedMembers: 1, isDeleted: 1, organization: 1 },
  {
    name: 'idx_assigned_members',
    partialFilterExpression: { isDeleted: false },
  },
);

PersonaSchema.index(
  { isDarkroomCharacter: 1, isDeleted: 1, organization: 1 },
  {
    name: 'idx_darkroom_characters',
    partialFilterExpression: { isDarkroomCharacter: true, isDeleted: false },
  },
);

PersonaSchema.index(
  {
    isAutopilotEnabled: 1,
    isDeleted: 1,
    nextAutopilotRunAt: 1,
    organization: 1,
  },
  {
    name: 'idx_autopilot_due',
    partialFilterExpression: { isAutopilotEnabled: true, isDeleted: false },
  },
);
