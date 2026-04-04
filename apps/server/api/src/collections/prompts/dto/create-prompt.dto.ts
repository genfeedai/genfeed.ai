import { IsModelKeyOrTraining } from '@api/helpers/validators/model-key-or-training.validator';
import { AssetScope, PromptCategory, PromptStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreatePromptDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly organization?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly brand?: Types.ObjectId;

  @IsString()
  @ApiProperty({
    description:
      'Prompt type (supports dynamic types like models-prompt-genfeedai/<destination>)',
    enum: PromptCategory,
    enumName: 'PromptCategory',
    example: 'presets-description-image',
    required: true,
  })
  readonly category!: PromptCategory;

  @IsString()
  @ApiProperty({ required: true })
  readonly original!: string;

  @IsString()
  @IsOptional()
  readonly enhanced?: string;

  // Style elements - stored as key strings
  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly style?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly mood?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly camera?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly scene?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly fontFamily?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  readonly blacklists?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  readonly sounds?: string[];

  @IsArray()
  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  readonly tags?: Types.ObjectId[];

  // Model-specific fields
  @IsString()
  @IsOptional()
  @IsModelKeyOrTraining({
    message:
      'Invalid model: must be a ModelKey, a Replicate destination (owner/model[:version]) or a Replicate version id',
  })
  @ApiProperty({
    description:
      'Model key or Replicate destination (owner/model[:version]) or Replicate version id',
    required: false,
  })
  readonly model?: string;

  // Additional metadata
  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly duration?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly ratio?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly resolution?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly seed?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly reference?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly fps?: number;

  @IsOptional()
  @IsEnum(PromptStatus)
  @ApiProperty({
    enum: PromptStatus,
    enumName: 'PromptStatus',
    required: false,
  })
  readonly status?: PromptStatus;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ default: false })
  readonly isSkipEnhancement?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'System prompt template key for enhancement (e.g., system.image, system.brand)',
    example: 'system.image',
    required: false,
  })
  readonly systemPromptKey?: string;

  @IsEnum(AssetScope)
  @IsOptional()
  @ApiProperty({ enum: AssetScope, enumName: 'AssetScope', required: false })
  readonly scope?: AssetScope;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether this prompt is marked as favorite',
    required: false,
  })
  readonly isFavorite?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Speech text for Google Veo3 models',
    required: false,
  })
  readonly speech?: string;
}
