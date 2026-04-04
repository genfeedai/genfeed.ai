import {
  AssetScope,
  ContentRating,
  DarkroomAssetLabel,
  DarkroomReviewStatus,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type IngredientDocument = Ingredient &
  Document & {
    createdAt?: Date;
    updatedAt?: Date;
  };

export interface IngredientOwnershipValidationShape {
  brand?: Types.ObjectId | null;
  category?: string | null;
  organization?: Types.ObjectId | null;
  provider?: string | null;
  scope?: AssetScope | null;
  user?: Types.ObjectId | null;
  voiceSource?: string | null;
}

export function isProviderBackedPublicCatalogVoice(
  doc: IngredientOwnershipValidationShape,
): boolean {
  return (
    doc.category === IngredientCategory.VOICE &&
    doc.scope === AssetScope.PUBLIC &&
    doc.voiceSource === 'catalog' &&
    typeof doc.provider === 'string' &&
    doc.provider.trim().length > 0
  );
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ingredients',
  discriminatorKey: 'category',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Ingredient {
  @Prop({
    ref: 'User',
    required: false,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: false,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({
    ref: 'Folder',
    required: false,
    type: Types.ObjectId,
  })
  folder?: Types.ObjectId;

  @Prop({
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  parent?: Types.ObjectId;

  @Prop({
    default: [],
    required: false,
    type: [
      {
        ref: 'Ingredient',
        type: Types.ObjectId,
      },
    ],
  })
  sources?: Types.ObjectId[]; // For tracking merged ingredients

  // Group ID for batch operations (e.g., interpolation pairs)
  @Prop({ index: true, required: false, sparse: true, type: String })
  groupId?: string;

  @Prop({ required: false, type: Number })
  groupIndex?: number;

  // Whether to auto-merge all videos in the same groupId when all complete
  @Prop({ required: false, type: Boolean })
  isMergeEnabled?: boolean;

  @Prop({
    ref: 'Metadata',
    type: Types.ObjectId,
  })
  metadata!: Types.ObjectId;

  @Prop({
    ref: 'Prompt',
    required: false,
    type: Types.ObjectId,
  })
  prompt?: Types.ObjectId;

  @Prop({
    required: false,
    type: [Types.ObjectId],
  })
  references?: Types.ObjectId[];

  @Prop({
    ref: 'Training',
    required: false,
    type: Types.ObjectId,
  })
  training?: Types.ObjectId;

  @Prop({
    ref: 'Bookmark',
    required: false,
    type: Types.ObjectId,
  })
  bookmark?: Types.ObjectId;

  @Prop({
    default: IngredientCategory.IMAGE,
    enum: IngredientCategory,
    required: true,
    type: String,
  })
  category!: string;

  @Prop({
    default: IngredientStatus.DRAFT,
    enum: IngredientStatus,
    required: true,
    type: String,
  })
  status!: IngredientStatus;

  @Prop({
    default: [],
    enum: TransformationCategory,
    type: [String],
  })
  transformations!: string[];

  @Prop({ default: 0, type: Number })
  order!: number;

  @Prop({ default: 1, type: Number })
  version!: number;

  @Prop({ default: false, type: Boolean })
  isHighlighted!: boolean;

  @Prop({ default: false, type: Boolean })
  isDefault!: boolean;

  @Prop({
    default: AssetScope.USER,
    enum: AssetScope,
    index: true,
    type: String,
  })
  scope!: AssetScope;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: false, type: Boolean })
  isFavorite!: boolean;

  @Prop({ default: false, index: true, type: Boolean })
  isPublic!: boolean; // For public gallery visibility (getshareable.app)

  @Prop({
    default: [],
    ref: 'Tag',
    type: [Types.ObjectId],
  })
  tags!: Types.ObjectId[];

  @Prop({ required: false, type: String })
  promptTemplate?: string;

  @Prop({ required: false, type: Number })
  templateVersion?: number;

  // === Darkroom fields (all optional, no migration risk) ===

  @Prop({ required: false, type: String })
  s3Key?: string;

  @Prop({ required: false, type: String })
  cdnUrl?: string;

  @Prop({
    ref: 'Persona',
    required: false,
    type: Types.ObjectId,
  })
  persona?: Types.ObjectId;

  @Prop({ index: true, required: false, type: String })
  personaSlug?: string;

  @Prop({
    enum: Object.values(ContentRating),
    required: false,
    type: String,
  })
  contentRating?: ContentRating;

  @Prop({
    enum: Object.values(DarkroomReviewStatus),
    required: false,
    type: String,
  })
  reviewStatus?: DarkroomReviewStatus;

  @Prop({
    enum: Object.values(DarkroomAssetLabel),
    required: false,
    type: String,
  })
  assetLabel?: DarkroomAssetLabel;

  @Prop({ required: false, type: String })
  generationSource?: string;

  // Agent attribution — set when created by a proactive agent run
  @Prop({ index: true, ref: 'AgentRun', required: false, type: Types.ObjectId })
  agentRunId?: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'AgentStrategy',
    required: false,
    type: Types.ObjectId,
  })
  agentStrategyId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  campaign?: string;

  @Prop({ required: false, type: Number })
  campaignWeek?: number;

  @Prop({ required: false, type: String })
  modelUsed?: string;

  @Prop({ required: false, type: String })
  loraUsed?: string;

  @Prop({ required: false, type: String })
  generationPrompt?: string;

  @Prop({ required: false, type: String })
  negativePrompt?: string;

  @Prop({ required: false, type: Number })
  generationSeed?: number;

  @Prop({ required: false, type: Number })
  cfgScale?: number;

  @Prop({ required: false, type: Number })
  generationSteps?: number;

  @Prop({ required: false, type: String })
  workflowUsed?: string;

  @Prop({ required: false, type: String })
  generationStage?: string;

  @Prop({ required: false, type: Number })
  generationProgress?: number;

  @Prop({ required: false, type: String })
  generationError?: string;

  @Prop({ required: false, type: Date })
  generationStartedAt?: Date;

  @Prop({ required: false, type: Date })
  generationCompletedAt?: Date;

  @Prop({ required: false, type: Number })
  fileSize?: number;

  @Prop({ required: false, type: String })
  mimeType?: string;

  @Prop({ default: [], required: false, type: [String] })
  postedTo?: string[];

  @Prop({ required: false, type: Number })
  qualityScore?: number;

  @Prop({ default: [], required: false, type: [String] })
  qualityFeedback?: string[];

  @Prop({
    default: 'unrated',
    enum: ['unrated', 'good', 'needs_review'],
    type: String,
  })
  qualityStatus!: string;

  // Virtual field
  hasVoted?: boolean;
}

export const IngredientSchema = SchemaFactory.createForClass(Ingredient);

IngredientSchema.pre('validate', function validateIngredientOwnership() {
  if (
    isProviderBackedPublicCatalogVoice(
      this as IngredientOwnershipValidationShape,
    )
  ) {
    return;
  }

  const ownerFields = [
    ['user', this.user],
    ['organization', this.organization],
    ['brand', this.brand],
  ] as const;

  for (const [field, value] of ownerFields) {
    if (value == null) {
      this.invalidate(
        field,
        `${field} is required unless the ingredient is a provider-backed public catalog voice`,
      );
    }
  }
});

IngredientSchema.index(
  { isDeleted: 1, persona: 1, reviewStatus: 1 },
  {
    name: 'idx_darkroom_persona_review',
    partialFilterExpression: { isDeleted: false, persona: { $exists: true } },
  },
);

IngredientSchema.index(
  { campaign: 1, isDeleted: 1, personaSlug: 1 },
  {
    name: 'idx_darkroom_campaign',
    partialFilterExpression: { campaign: { $exists: true }, isDeleted: false },
  },
);
