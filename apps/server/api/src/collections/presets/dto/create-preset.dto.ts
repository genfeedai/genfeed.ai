import { ElementDto } from '@api/shared/dto/element/element.dto';
import { ModelCategory, Platform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePresetDto extends ElementDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The organization ID for the preset',
    required: false,
  })
  organization?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The brand ID for the preset (null for org-wide presets)',
    required: false,
  })
  brand?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Ingredient image ID used as thumbnail for the preset',
    required: false,
  })
  ingredient?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Optimized prompt for AI generation (separate from description)',
    required: false,
  })
  prompt?: string;

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
