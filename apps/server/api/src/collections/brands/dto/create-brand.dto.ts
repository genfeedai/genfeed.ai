import { MODEL_KEYS } from '@genfeedai/constants';
import { AssetScope, FontFamily } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import type { Types } from 'mongoose';

export class CreateBrandDto {
  @IsString()
  @ApiProperty({
    description: 'The unique slug for the brand',
    required: false,
  })
  readonly slug!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The display name of the brand',
    required: true,
  })
  readonly label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'A description of the brand', required: false })
  readonly description?: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Optional voice ID to use for this brand',
    required: false,
  })
  readonly voice?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Optional music ID to use for this brand',
    required: false,
  })
  readonly music?: Types.ObjectId;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Text prompt for content generation',
    required: false,
  })
  readonly text?: string;

  @IsString()
  @ApiProperty({
    default: FontFamily.MONTSERRAT_BLACK,
    description: 'The font family to use for text overlays',
    enum: Object.values(FontFamily),
    enumName: 'FontFamily',
    required: true,
  })
  readonly fontFamily!: string;

  @IsString()
  @ApiProperty({
    default: '#000000',
    description: 'The primary color theme for the brand',
    required: true,
  })
  readonly primaryColor!: string;

  @IsString()
  @ApiProperty({
    default: '#FFFFFF',
    description: 'The secondary color theme for the brand',
    required: true,
  })
  readonly secondaryColor!: string;

  @IsString()
  @ApiProperty({
    default: '#000000',
    description: 'The background color theme for the brand',
    required: true,
  })
  readonly backgroundColor!: string;

  @IsBoolean()
  @ApiProperty({
    description: 'Whether this brand is currently selected',
    required: true,
  })
  readonly isSelected!: boolean;

  @IsEnum(AssetScope)
  @IsOptional()
  @ApiProperty({
    default: AssetScope.USER,
    description: 'Brand access scope',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  readonly scope?: AssetScope;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether this brand is currently active',
    required: false,
  })
  readonly isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether this brand is highlighted on the website',
    required: false,
  })
  readonly isHighlighted?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Whether this brand can access darkroom fleet features and assets',
    required: false,
  })
  readonly isDarkroomEnabled?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The default model to use for video generation',
    enum: Object.values(MODEL_KEYS),
    enumName: 'ModelKey',
    required: false,
  })
  readonly defaultVideoModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The default model to use for image generation',
    enum: Object.values(MODEL_KEYS),
    enumName: 'ModelKey',
    required: false,
  })
  readonly defaultImageModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The default model to use for image-to-video conversion',
    enum: Object.values(MODEL_KEYS),
    enumName: 'ModelKey',
    required: false,
  })
  readonly defaultImageToVideoModel?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The default model to use for music generation',
    enum: Object.values(MODEL_KEYS),
    enumName: 'ModelKey',
    required: false,
  })
  readonly defaultMusicModel?: string;
}
