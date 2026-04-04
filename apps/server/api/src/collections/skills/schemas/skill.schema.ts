import { ByokProvider, ContentSkillCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export const SKILL_MODALITIES = [
  'text',
  'image',
  'video',
  'audio',
  'multi',
] as const;

export const SKILL_CHANNELS = [
  'tiktok',
  'reels',
  'youtube',
  'x',
  'linkedin',
  'blog',
  'ads',
] as const;

export const SKILL_WORKFLOW_STAGES = [
  'research',
  'planning',
  'creation',
  'review',
  'publishing',
  'analysis',
] as const;

export const SKILL_SOURCES = ['built_in', 'imported', 'custom'] as const;

export const SKILL_STATUSES = ['draft', 'published', 'disabled'] as const;

export type SkillDocument = Skill & Document;

@Schema({
  collection: 'content-skills',
  timestamps: true,
  versionKey: false,
})
export class Skill {
  _id!: string;

  @Prop({
    index: true,
    ref: 'Organization',
    required: false,
    type: Types.ObjectId,
  })
  organization?: Types.ObjectId | null;

  @Prop({
    index: true,
    required: true,
    type: String,
  })
  slug!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({
    enum: Object.values(ContentSkillCategory),
    required: true,
    type: String,
  })
  category!: ContentSkillCategory;

  @Prop({
    default: [],
    enum: SKILL_MODALITIES,
    type: [String],
  })
  modalities!: (typeof SKILL_MODALITIES)[number][];

  @Prop({
    default: [],
    enum: SKILL_CHANNELS,
    type: [String],
  })
  channels!: (typeof SKILL_CHANNELS)[number][];

  @Prop({
    default: 'creation',
    enum: SKILL_WORKFLOW_STAGES,
    type: String,
  })
  workflowStage!: (typeof SKILL_WORKFLOW_STAGES)[number];

  @Prop({
    default: [],
    enum: Object.values(ByokProvider),
    type: [String],
  })
  requiredProviders!: ByokProvider[];

  @Prop({ required: false, type: Object })
  configSchema?: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  inputSchema?: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  outputSchema?: Record<string, unknown>;

  @Prop({ required: false, type: String })
  defaultInstructions?: string;

  @Prop({ required: false, type: Object })
  reviewDefaults?: Record<string, unknown>;

  @Prop({
    default: 'built_in',
    enum: SKILL_SOURCES,
    type: String,
  })
  source!: (typeof SKILL_SOURCES)[number];

  @Prop({
    default: 'published',
    enum: SKILL_STATUSES,
    type: String,
  })
  status!: (typeof SKILL_STATUSES)[number];

  @Prop({
    ref: 'Skill',
    required: false,
    type: Types.ObjectId,
  })
  baseSkill?: Types.ObjectId | null;

  @Prop({ default: true, type: Boolean })
  isBuiltIn!: boolean;

  @Prop({ default: true, type: Boolean })
  isEnabled!: boolean;

  @Prop({ default: false, index: true, type: Boolean })
  isDeleted!: boolean;
}

export const SkillSchema = SchemaFactory.createForClass(Skill);
