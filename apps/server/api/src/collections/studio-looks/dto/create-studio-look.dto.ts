import { RouterPriority } from '@genfeedai/enums';
import type { StudioLookAssetType } from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STUDIO_LOOK_ASSET_TYPES = ['image', 'video'] as const;
const STUDIO_LOOK_BRANDING_MODES = ['brand', 'off'] as const;

export class CreateStudioLookDto {
  @ApiProperty({
    description: 'Display name for this saved Look',
    maxLength: 80,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  label!: string;

  @ApiProperty({ enum: STUDIO_LOOK_ASSET_TYPES })
  @IsIn(STUDIO_LOOK_ASSET_TYPES)
  assetType!: StudioLookAssetType;

  @ApiProperty({ description: 'Studio preset key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  promptTemplate!: string;

  @ApiProperty({ description: 'Studio style key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  style!: string;

  @ApiProperty({ description: 'Studio mood key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  mood!: string;

  @ApiProperty({ description: 'Studio scene key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  scene!: string;

  @ApiProperty({ description: 'Studio camera key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  camera!: string;

  @ApiProperty({ description: 'Studio lens key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  lens!: string;

  @ApiProperty({ description: 'Studio lighting key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  lighting!: string;

  @ApiProperty({
    description: 'Studio camera-movement key; accepted only for video Looks',
    maxLength: 200,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cameraMovement?: string | null;

  @ApiProperty({
    description:
      'Router model key for auto-routed generation; empty/omitted means Auto',
    maxLength: 200,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  modelKey?: string | null;

  @ApiProperty({
    description:
      'Priority for auto model routing: quality, speed, cost, or balanced',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  @IsOptional()
  @IsEnum(RouterPriority)
  prioritize?: RouterPriority | null;

  @ApiProperty({
    description: 'Number of outputs to generate',
    maximum: 10,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  outputs?: number | null;

  @ApiProperty({
    description: 'Aspect ratio for the generated output, e.g. "16:9"',
    maxLength: 20,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  aspectRatio?: string | null;

  @ApiProperty({
    description: 'Duration in seconds; accepted only for video Looks',
    maximum: 60,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  duration?: number | null;

  @ApiProperty({
    description: 'Target resolution for the generated output',
    maxLength: 20,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  resolution?: string | null;

  @ApiProperty({
    description: 'Brand context mode for prompt assembly',
    enum: STUDIO_LOOK_BRANDING_MODES,
    required: false,
  })
  @IsOptional()
  @IsIn(STUDIO_LOOK_BRANDING_MODES)
  brandingMode?: 'brand' | 'off' | null;

  @ApiProperty({
    default: true,
    description:
      'Whether the agent expands the prompt with brand + look context',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPromptEnhanceEnabled?: boolean;
}
