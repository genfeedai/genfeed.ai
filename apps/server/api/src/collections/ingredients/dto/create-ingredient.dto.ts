import {
  AssetScope,
  IngredientAvatarCategory,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
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
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly prompt?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Parent ingredient ID (for tracking origin/hierarchy)',
    required: false,
  })
  readonly parent?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Folder ID for organizing ingredients',
    required: false,
  })
  readonly folder?: string;

  @IsMongoId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Source ingredient IDs (for tracking merged content)',
    required: false,
    type: [Types.ObjectId],
  })
  readonly sources?: string[];

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly metadata?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly brand?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly training?: string;

  @IsMongoId({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'References to asset(s) or ingredient image(s) for generation',
    required: false,
    type: [Types.ObjectId],
  })
  readonly references?: string[];

  @IsString()
  @IsOptional()
  @IsEnum(IngredientCategory)
  @ApiProperty({
    default: IngredientCategory.IMAGE,
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
  })
  readonly category?: IngredientCategory;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly text?: string;

  @IsString({ each: true })
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
  readonly seed?: number;

  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Array of tag IDs for this ingredient',
    required: false,
    type: [Types.ObjectId],
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

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Quality status: unrated, good, or needs_review',
    enum: ['unrated', 'good', 'needs_review'],
    required: false,
  })
  readonly qualityStatus?: string;
}
