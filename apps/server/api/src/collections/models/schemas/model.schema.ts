import {
  CostTier,
  ModelCategory,
  ModelProvider,
  PricingType,
  QualityTier,
  SpeedTier,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { type Document, Types } from 'mongoose';

export type ModelDocument = Model & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'models',
  timestamps: true,
  versionKey: false,
})
export class Model {
  _id!: string;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  description?: string;

  @Prop({
    enum: Object.values(ModelCategory),
    required: true,
    type: String,
  })
  category!: ModelCategory;

  @Prop({
    enum: Object.values(ModelProvider),
    required: true,
    type: String,
  })
  provider!: ModelProvider;

  @Prop({
    required: true,
    type: String,
    unique: true,
  })
  key!: string;

  @Prop({ default: 0, type: Number })
  cost!: number;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isHighlighted!: boolean;

  @Prop({ default: false, type: Boolean })
  isDefault!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  // ============================================================================
  // Router Metadata Fields
  // ============================================================================
  // These fields enable intelligent AI model selection via RouterService.
  // The router analyzes user prompts and matches them to optimal models using
  // these metadata fields combined with prompt analysis.
  // ============================================================================

  /**
   * Model capabilities - What the model can do
   * @example ['photorealistic', 'high-detail', 'large-format']
   * @example ['cinematic', 'r2v', 'interpolation', 'audio-generation']
   * @example ['quick', 'efficient', 'versatile']
   *
   * Common capability tags:
   * - Quality: photorealistic, high-detail, cinematic, detailed
   * - Speed: quick, fast, efficient
   * - Features: r2v, i2v, interpolation, audio-generation, speech-support
   * - Style: creative, stylized, versatile, balanced
   * - Format: long-form, short-form, large-format
   */
  @Prop({ default: [], type: [String] })
  capabilities?: string[];

  /**
   * Cost tier for pricing and router optimization
   * - low: Budget-friendly models (e.g., imagen-4-fast, veo-3-fast)
   * - medium: Balanced cost/quality (e.g., imagen-4, sora-2)
   * - high: Premium models (e.g., imagen-4-ultra, veo-3)
   */
  @Prop({
    default: CostTier.MEDIUM,
    enum: Object.values(CostTier),
    type: String,
  })
  costTier?: CostTier;

  /**
   * Keywords for router recommendation matching
   * @example ['professional', 'high-quality', 'detailed', 'photorealistic']
   * @example ['quick', 'fast', 'simple', 'draft']
   * @example ['cartoon', 'anime', 'artistic', 'stylized']
   *
   * The router matches these against analyzed prompt keywords to recommend
   * the most appropriate model for the user's intent.
   */
  @Prop({ default: [], type: [String] })
  recommendedFor?: string[];

  /**
   * Minimum supported dimensions (width x height in pixels)
   * Used for validation and router filtering
   * @example { width: 512, height: 512 }
   */
  @Prop({ required: false, type: Object })
  minDimensions?: { width: number; height: number };

  /**
   * Maximum supported dimensions (width x height in pixels)
   * @example { width: 4096, height: 4096 }
   * @example { width: 2048, height: 2048 }
   */
  @Prop({ required: false, type: Object })
  maxDimensions?: { width: number; height: number };

  /**
   * Technical feature support flags
   * @example ['speech', 'long-duration', 'negative-prompt']
   * @example ['reference-to-video', 'interpolation', 'audio']
   *
   * Common feature flags:
   * - Video: speech, audio, interpolation, r2v (reference-to-video)
   * - Duration: short-duration, long-duration
   * - Input: negative-prompt, reference-images
   */
  @Prop({ default: [], type: [String] })
  supportsFeatures?: string[];

  /**
   * Speed tier for generation time
   * - fast: Quick generation (e.g., imagen-4-fast, veo-3-fast)
   * - medium: Balanced speed (e.g., imagen-4, sora-2)
   * - slow: Slower but higher quality (e.g., imagen-4-ultra, veo-3)
   */
  @Prop({
    default: SpeedTier.MEDIUM,
    enum: Object.values(SpeedTier),
    type: String,
  })
  speedTier?: SpeedTier;

  /**
   * Output quality tier
   * - basic: Entry-level quality
   * - standard: Good quality for most uses (e.g., imagen-4-fast)
   * - high: High quality (e.g., imagen-4, veo-3-fast)
   * - ultra: Premium quality (e.g., imagen-4-ultra, veo-3)
   */
  @Prop({
    default: QualityTier.STANDARD,
    enum: Object.values(QualityTier),
    type: String,
  })
  qualityTier?: QualityTier;

  // ============================================================================
  // Dynamic Pricing Fields
  // ============================================================================
  // These fields enable variable pricing based on output dimensions or duration.
  // ============================================================================

  /**
   * Pricing model type
   * - flat: Fixed cost per generation (default, uses `cost` field)
   * - per-megapixel: Cost based on output dimensions (width × height / 1,000,000)
   * - per-second: Cost based on output duration in seconds
   * - per-token: Cost based on estimated input/output token usage
   */
  @Prop({
    default: PricingType.FLAT,
    enum: [...Object.values(PricingType), 'per-token'],
    type: String,
  })
  pricingType?: PricingType | 'per-token';

  /**
   * Cost per unit (megapixel or second) in credits
   * Only used when pricingType is 'per-megapixel' or 'per-second'
   * @example 5 for 5 credits per megapixel
   * @example 80 for 80 credits per second
   */
  @Prop({ default: 0, type: Number })
  costPerUnit?: number;

  /**
   * Minimum cost floor regardless of calculation
   * Ensures very small outputs still have a minimum charge
   * @example 5 for minimum 5 credits per generation
   */
  @Prop({ default: 0, type: Number })
  minCost?: number;

  /**
   * Sell-side credits charged per 1M input tokens.
   * Only used when pricingType is 'per-token'
   */
  @Prop({ default: 0, type: Number })
  inputCostPerMillionTokens?: number;

  /**
   * Sell-side credits charged per 1M output tokens.
   * Only used when pricingType is 'per-token'
   */
  @Prop({ default: 0, type: Number })
  outputCostPerMillionTokens?: number;

  /**
   * Raw provider cost in USD for this model's typical run.
   * Used to calculate sell price via 70% margin formula: sellPrice = providerCostUsd / 0.30
   */
  @Prop({ type: Number })
  providerCostUsd?: number;

  // ============================================================================
  // Output Capability Fields (migrated from MODEL_OUTPUT_CAPABILITIES constant)
  // ============================================================================
  // These fields store per-model output capabilities directly in the DB,
  // eliminating the need for a hardcoded constant file.
  // ============================================================================

  /** Supported aspect ratios for this model */
  @Prop({ default: undefined, type: [String] })
  aspectRatios?: string[];

  /** Default aspect ratio when none specified */
  @Prop({ required: false, type: String })
  defaultAspectRatio?: string;

  /** Maximum number of outputs per generation */
  @Prop({ default: 4, type: Number })
  maxOutputs?: number;

  /** Maximum number of reference images/videos accepted */
  @Prop({ default: 1, type: Number })
  maxReferences?: number;

  /** Whether batch generation is supported */
  @Prop({ default: false, type: Boolean })
  isBatchSupported?: boolean;

  /** Available duration options in seconds (video/music/voice) */
  @Prop({ default: undefined, type: [Number] })
  durations?: number[];

  /** Default duration in seconds */
  @Prop({ required: false, type: Number })
  defaultDuration?: number;

  /** Whether model supports end-frame specification (video) */
  @Prop({ default: false, type: Boolean })
  hasEndFrame?: boolean;

  /** Whether model supports frame interpolation (video) */
  @Prop({ default: false, type: Boolean })
  hasInterpolation?: boolean;

  /** Whether model supports speech generation (video) */
  @Prop({ default: false, type: Boolean })
  hasSpeech?: boolean;

  /** Whether model has audio on/off toggle (video) */
  @Prop({ default: false, type: Boolean })
  hasAudioToggle?: boolean;

  /** Whether model supports resolution options (video) */
  @Prop({ default: false, type: Boolean })
  hasResolutionOptions?: boolean;

  /** Whether this is a Google Imagen-family model */
  @Prop({ default: false, type: Boolean })
  isImagenModel?: boolean;

  /** Whether reference images are required (not optional) */
  @Prop({ default: false, type: Boolean })
  isReferencesMandatory?: boolean;

  /** Whether model uses portrait/landscape instead of ratios */
  @Prop({ default: false, type: Boolean })
  usesOrientation?: boolean;

  /** Whether model supports duration editing (video/music/voice) */
  @Prop({ default: undefined, type: Boolean })
  hasDurationEditing?: boolean;

  // ============================================================================
  // Model Lifecycle Fields
  // ============================================================================

  /** Key of the newer model that supersedes this one */
  @Prop({ required: false, type: String })
  succeededBy?: string;

  /** Key of the older model this one supersedes */
  @Prop({ required: false, type: String })
  predecessorOf?: string;

  /** Whether this model has been deprecated by the auto-deprecation cron */
  @Prop({ default: false, type: Boolean })
  isDeprecated?: boolean;

  /** Date when this model was auto-deprecated */
  @Prop({ required: false, type: Date })
  deprecatedAt?: Date;

  // ============================================================================
  // Provider Auto-Discovery Fields (v7 — issue #93)
  // ============================================================================

  /** Whether this model is visible in the community marketplace */
  @Prop({ default: false, type: Boolean })
  isPublic?: boolean;

  /** Whether this model is legacy / superseded by a newer version */
  @Prop({ default: false, type: Boolean })
  isLegacy?: boolean;

  /** True if the model was auto-discovered from a provider API (not manually seeded) */
  @Prop({ default: false, type: Boolean })
  isDiscovered?: boolean;

  /** Timestamp when the model was first discovered via provider sync */
  @Prop({ required: false, type: Date })
  discoveredAt?: Date;

  /** Timestamp of the most recent provider sync for this model */
  @Prop({ required: false, type: Date })
  lastSyncedAt?: Date;

  /**
   * Platform margin as a percentage (0–100).
   * Used to calculate the sell price on top of provider cost.
   * Default 70 — i.e. sell price = providerCostUsd / (1 - 0.70)
   */
  @Prop({ default: 70, type: Number })
  margin?: number;

  // --- Dynamic Registry Fields (v6) ---

  @Prop({ type: Types.ObjectId, ref: 'Organization', default: null })
  organization?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Training', default: null })
  training?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Model', default: null })
  parentModel?: Types.ObjectId;

  @Prop({ type: String, default: null })
  providerModelId?: string;

  @Prop({ type: mongoose.Schema.Types.Mixed, default: null })
  providerConfig?: Record<string, unknown>;

  @Prop({ type: String, default: null })
  triggerWord?: string;
}

export const ModelSchema = SchemaFactory.createForClass(Model);

// --- Dynamic Registry Indexes (v6) ---
ModelSchema.index({ isActive: 1, isDeleted: 1, organization: 1 });
ModelSchema.index(
  { training: 1 },
  {
    unique: true,
    partialFilterExpression: { training: { $exists: true, $ne: null } },
  },
);
ModelSchema.index({ parentModel: 1 });
