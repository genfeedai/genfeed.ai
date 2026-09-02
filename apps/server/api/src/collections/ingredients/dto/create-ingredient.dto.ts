import type { PrismaIngredientCategoryValue } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  AssetScope,
  ContentRating,
  FleetReviewStatus,
  IngredientAvatarCategory,
  IngredientCategory,
  IngredientStatus,
  QualityStatus,
  TransformationCategory,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAvatarDto {
  @IsString()
  @IsEnum(IngredientAvatarCategory)
  @ApiProperty({
    enum: IngredientAvatarCategory,
    enumName: 'IngredientAvatarCategory',
    required: true,
  })
  readonly category!: IngredientAvatarCategory;

  @IsString()
  @ApiProperty({ required: true })
  readonly avatarId!: string;

  @IsString()
  @ApiProperty({ required: true })
  readonly voiceId!: string;

  @IsString()
  @ApiProperty({ required: true })
  readonly text!: string;
}

export class CreateIngredientDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly userId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly organizationId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ nullable: true, required: false, type: String })
  readonly brandId?: string | null;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly promptId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly parentId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ nullable: true, required: false, type: String })
  readonly folderId?: string | null;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly trainingId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly bookmarkId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly personaId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly workflowExecutionId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly agentStrategyId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  @ApiProperty({
    description: 'Confirmed agent action identity for durable reconciliation',
    required: false,
  })
  readonly sourceActionId?: string;

  @IsEntityId({ each: true })
  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'Source ingredient IDs (for tracking merged content)',
    required: false,
    type: [String],
  })
  readonly sources?: string[];

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Metadata ID',
    required: false,
  })
  readonly metadataId?: string;

  @IsString()
  @IsOptional()
  @IsEnum(IngredientCategory)
  @ApiProperty({
    default: IngredientCategory.IMAGE,
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
  })
  // Accepts the Prisma UPPERCASE value too: internal write-boundary callers
  // (CategoryPrismaUtil.toIngredientCategory) pass the persisted form, while
  // HTTP input is still validated as the app enum by @IsEnum above (#564).
  readonly category?: IngredientCategory | PrismaIngredientCategoryValue;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly generationPrompt?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Redacted generation-brief compiler identity',
    required: false,
  })
  readonly generationSource?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Redacted generation-brief compiler and profile evidence',
    required: false,
  })
  readonly providerData?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly modelUsed?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly negativePrompt?: string;

  @IsArray()
  @IsOptional()
  @IsEnum(TransformationCategory, { each: true })
  @ApiProperty({
    description: 'Transformations applied to this ingredient',
    enum: TransformationCategory,
    enumName: 'TransformationCategory',
    isArray: true,
    required: false,
  })
  readonly transformations?: TransformationCategory[];

  @IsEnum(IngredientStatus)
  @IsOptional()
  @ApiProperty({
    enum: IngredientStatus,
    enumName: 'IngredientStatus',
    required: false,
  })
  readonly status?: IngredientStatus;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ default: 0 })
  readonly order?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ default: 1 })
  readonly version?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: false, required: false })
  readonly isDefault?: boolean;

  @IsEnum(AssetScope)
  @IsOptional()
  @ApiProperty({ enum: AssetScope, enumName: 'AssetScope', required: false })
  readonly scope?: AssetScope;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: false, required: false })
  readonly isHighlighted?: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly generationSeed?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly isMergeEnabled?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly language?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly voiceSource?: string;

  @IsArray()
  @IsEntityId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Array of tag IDs for this ingredient',
    required: false,
    type: [String],
  })
  readonly tags?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Group ID for batch operations (e.g., interpolation pairs)',
    required: false,
  })
  readonly groupId?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Index within the group for ordering',
    required: false,
  })
  readonly groupIndex?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Quality score from auto-rating (0-10)',
    required: false,
  })
  readonly qualityScore?: number;

  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Quality feedback suggestions from auto-rating',
    required: false,
    type: [String],
  })
  readonly qualityFeedback?: string[];

  @IsEnum(QualityStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Automated quality verdict for the ingredient',
    enum: QualityStatus,
    required: false,
  })
  readonly qualityStatus?: QualityStatus;

  @IsEnum(ContentRating)
  @IsOptional()
  @ApiProperty({
    description: 'Moderation content rating for fleet assets',
    required: false,
  })
  readonly contentRating?: ContentRating;

  @IsEnum(FleetReviewStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Fleet review status for moderated assets',
    enum: FleetReviewStatus,
    enumName: 'FleetReviewStatus',
    required: false,
  })
  readonly reviewStatus?: FleetReviewStatus;
}
