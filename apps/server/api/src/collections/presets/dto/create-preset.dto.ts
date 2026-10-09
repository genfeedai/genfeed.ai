import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ElementDto } from '@api/shared/dto/element/element.dto';
import { ModelCategory, Platform } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreatePresetDto extends ElementDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'The organization ID for the preset',
    required: false,
  })
  organizationId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'The brand ID for the preset (null for org-wide presets)',
    required: false,
  })
  brandId?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Ingredient image ID used as thumbnail for the preset',
    required: false,
  })
  ingredientId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Optimized prompt for AI generation (separate from description)',
    required: false,
  })
  prompt?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:[1-9]\d*)(?:\.\d+)?:[1-9]\d*(?:\.\d+)?$|^$/)
  @ApiProperty({
    description: 'Output aspect ratio, such as 16:9',
    required: false,
  })
  aspectRatio?: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  @Max(3600)
  @ApiProperty({ description: 'Video duration in seconds', required: false })
  duration?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Prompt template key', required: false })
  promptTemplate?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Lighting description or key', required: false })
  lighting?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Lens description or key', required: false })
  lens?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Camera movement description or key',
    required: false,
  })
  cameraMovement?: string;

  @IsEnum(ModelCategory)
  @ApiProperty({
    description: 'The category of AI model this preset is for',
    enum: ModelCategory,
    enumName: 'ModelCategory',
  })
  category!: ModelCategory;

  @IsEnum(Platform)
  @IsOptional()
  @ApiProperty({
    description:
      'The platform this preset is for (undefined for universal presets)',
    enum: Platform,
    enumName: 'Platform',
    required: false,
  })
  platform?: Platform;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Camera key to auto-select',
    required: false,
  })
  camera?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Mood key to auto-select',
    required: false,
  })
  mood?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Scene key to auto-select',
    required: false,
  })
  scene?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Style key to auto-select',
    required: false,
  })
  style?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Blacklist keys to auto-select',
    required: false,
    type: [String],
  })
  blacklists?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether the preset is active',
    required: false,
  })
  isActive?: boolean;
}
