import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetScope, FontFamily } from '@genfeedai/contracts';
import {
  BRAND_HANDLE_FORMAT_MESSAGE,
  BRAND_HANDLE_MAX_LENGTH,
  BRAND_HANDLE_MIN_LENGTH,
  BRAND_HANDLE_PATTERN,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBrandDto {
  // Omitted: the server derives a free handle from the label.
  @IsOptional()
  @IsString()
  @MinLength(BRAND_HANDLE_MIN_LENGTH)
  @MaxLength(BRAND_HANDLE_MAX_LENGTH)
  @Matches(BRAND_HANDLE_PATTERN, { message: BRAND_HANDLE_FORMAT_MESSAGE })
  @ApiProperty({
    description:
      'The brand handle: its public profile path and app route segment. ' +
      'Unique across all brands.',
    maxLength: BRAND_HANDLE_MAX_LENGTH,
    minLength: BRAND_HANDLE_MIN_LENGTH,
    required: false,
  })
  readonly slug?: string;

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

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Optional voice ID to use for this brand',
    required: false,
  })
  readonly voice?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Optional music ID to use for this brand',
    required: false,
  })
  readonly music?: string;

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
    description: 'Whether this brand can access Fleet features and assets',
    required: false,
  })
  readonly isFleetEnabled?: boolean;

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
