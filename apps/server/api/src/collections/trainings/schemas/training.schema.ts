import {
  ModelKey,
  TrainingCategory,
  TrainingProvider,
  TrainingStage,
  TrainingStatus,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { type Document, Types } from 'mongoose';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'trainings',
  timestamps: true,
  versionKey: false,
})
export class Training {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  @ApiProperty({
    description: 'Organization ID',
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  @ApiProperty({
    description: 'Brand ID',
  })
  brand?: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  @ApiProperty({
    description: 'User ID',
  })
  user!: Types.ObjectId;

  @Prop({
    default: [],
    required: true,
    type: [
      {
        ref: 'Ingredient',
        type: Types.ObjectId,
      },
    ],
  })
  @ApiProperty({ description: 'Source image IDs for training' })
  sources!: Types.ObjectId[];

  @Prop({ required: true, type: String })
  @ApiProperty({ description: 'Training label' })
  label!: string;

  @Prop({ type: String })
  @ApiProperty({ description: 'Model description' })
  description?: string;

  @Prop({
    default: TrainingProvider.REPLICATE,
    enum: Object.values(TrainingProvider),
    type: String,
  })
  @ApiProperty({
    default: TrainingProvider.REPLICATE,
    description: 'Training provider',
  })
  provider?: TrainingProvider;

  @Prop({ type: String })
  @ApiProperty({
    default:
      'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
    description: 'Model version',
  })
  model!: string;

  @Prop({
    required: true,
    type: String,
  })
  @ApiProperty({ description: 'Trigger word for the model' })
  trigger!: string;

  @Prop({
    default: TrainingCategory.SUBJECT,
    enum: Object.values(TrainingCategory),
    required: true,
    type: String,
  })
  @ApiProperty({ description: 'Training category (subject or style)' })
  category!: TrainingCategory;

  @Prop({
    enum: Object.values(TrainingStatus),
    type: String,
  })
  @ApiProperty({ description: 'Training status' })
  status?: TrainingStatus;

  @Prop({ type: Number })
  @ApiProperty({ description: 'Training steps' })
  steps!: number;

  @Prop({ default: -1, type: Number })
  @ApiProperty({ description: 'Random seed used for training' })
  seed?: number;

  @Prop({
    index: true,
    set: (v: unknown) =>
      v === '' || v === null || v === undefined ? undefined : v,
    sparse: true,
    type: String,
  })
  @ApiProperty({ description: 'External provider training ID' })
  externalId?: string;

  @Prop({ default: false, type: Boolean })
  @ApiProperty({ description: 'Is deleted' })
  isDeleted!: boolean;

  @Prop({ default: true, type: Boolean })
  @ApiProperty({ description: 'Is active' })
  isActive!: boolean;

  @Prop({
    default: ModelKey.GENFEED_AI_Z_IMAGE_TURBO,
    required: false,
    type: String,
  })
  @ApiProperty({
    default: ModelKey.GENFEED_AI_Z_IMAGE_TURBO,
    description: 'Base model used for training',
  })
  baseModel?: string;

  // === Darkroom fields (all optional, no migration risk) ===

  @Prop({
    ref: 'Persona',
    required: false,
    type: Types.ObjectId,
  })
  @ApiProperty({ description: 'Persona associated with this training' })
  persona?: Types.ObjectId;

  @Prop({ index: true, required: false, type: String })
  @ApiProperty({ description: 'Persona slug for quick lookups' })
  personaSlug?: string;

  @Prop({ required: false, type: String })
  @ApiProperty({ description: 'LoRA model name' })
  loraName?: string;

  @Prop({ required: false, type: String })
  @ApiProperty({ description: 'Path to training log file' })
  logPath?: string;

  @Prop({
    enum: Object.values(TrainingStage),
    required: false,
    type: String,
  })
  @ApiProperty({ description: 'Current training stage' })
  stage?: TrainingStage;

  @Prop({ required: false, type: Number })
  @ApiProperty({ description: 'Training progress (0-100)' })
  progress?: number;

  @Prop({ required: false, type: String })
  @ApiProperty({ description: 'Error message if training failed' })
  error?: string;

  @Prop({ required: false, type: Number })
  @ApiProperty({ description: 'LoRA rank (dimensionality)' })
  loraRank?: number;

  @Prop({ required: false, type: Number })
  @ApiProperty({ description: 'Learning rate used for training' })
  learningRate?: number;

  @Prop({ required: false, type: Date })
  @ApiProperty({ description: 'When training started' })
  startedAt?: Date;

  @Prop({ required: false, type: Date })
  @ApiProperty({ description: 'When training completed' })
  completedAt?: Date;

  // Virtual fields
  @ApiProperty({ description: 'Total number of source ingredients' })
  totalSources?: number;

  @ApiProperty({ description: 'Total number of images in all sources' })
  totalGeneratedImages?: number;
}

export type TrainingDocument = Training & Document;

export const TrainingSchema = SchemaFactory.createForClass(Training);

TrainingSchema.index(
  { createdAt: -1, isDeleted: 1, organization: 1 },
  { name: 'idx_org_created_at' },
);

TrainingSchema.index(
  { brand: 1, createdAt: -1, isDeleted: 1 },
  { name: 'idx_brand_created_at' },
);

TrainingSchema.index(
  { isDeleted: 1, persona: 1, stage: 1 },
  {
    name: 'idx_persona_stage',
    partialFilterExpression: { isDeleted: false, persona: { $exists: true } },
  },
);
