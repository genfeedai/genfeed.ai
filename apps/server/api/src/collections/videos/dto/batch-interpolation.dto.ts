import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { IngredientFormat } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class InterpolationPairDto {
  @IsEntityId()
  @ApiProperty({
    description: 'The ID of the start frame image',
    example: '507f1f77bcf86cd799439011',
  })
  startImageId!: string;

  @IsEntityId()
  @ApiProperty({
    description: 'The ID of the end frame image',
    example: '507f1f77bcf86cd799439012',
  })
  endImageId!: string;

  @ApiProperty({
    description: 'Optional prompt to guide the interpolation',
    example: 'smooth camera dolly forward',
    required: false,
  })
  @IsString()
  @IsOptional()
  prompt?: string;
}

export class BatchInterpolationDto {
  @ApiProperty({
    description: 'Array of frame pairs to interpolate',
    maxItems: 50,
    minItems: 1,
    type: [InterpolationPairDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InterpolationPairDto)
  pairs!: InterpolationPairDto[];

  @IsString()
  @ApiProperty({
    description: 'The model key to use for interpolation',
    type: String,
    example: 'replicate-google-veo-3-1',
  })
  modelKey!: string;

  @ApiProperty({
    default: false,
    description:
      'Whether the sequence is a loop (last frame connects to first)',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isLoopMode?: boolean;

  @ApiProperty({
    default: 5,
    description: 'Duration of each interpolation video in seconds',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  duration?: number;

  @ApiProperty({
    default: false,
    description:
      'Whether to automatically merge all generated videos into one after completion',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isMergeEnabled?: boolean;

  @ApiProperty({
    description: 'Camera movement prompt to apply to all pairs',
    example: 'slow dolly forward',
    required: false,
  })
  @IsString()
  @IsOptional()
  cameraPrompt?: string;

  @ApiProperty({
    default: IngredientFormat.LANDSCAPE,
    description: 'Video format/aspect ratio',
    enum: IngredientFormat,
    enumName: 'IngredientFormat',
    required: false,
  })
  @IsEnum(IngredientFormat)
  @IsOptional()
  format?: IngredientFormat;

  @ApiProperty({
    description: 'Prompt template key (e.g., "video.cinematic.default")',
    required: false,
  })
  @IsString()
  @IsOptional()
  promptTemplate?: string;

  @ApiProperty({
    default: true,
    description: 'Whether to use prompt templates for enhanced prompts',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  useTemplate?: boolean;
}
