import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { IngredientFormat, VideoTransition } from '@genfeedai/contracts';
import { VIDEO_STITCH_LIMITS } from '@genfeedai/contracts/constants';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
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

/** Stitch options the auto-merge applies once every clip has finished. */
export class InterpolationMergeSettingsDto {
  @ApiProperty({ default: false, required: false })
  @IsBoolean()
  @IsOptional()
  isCaptionsEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isMuteVideoAudio?: boolean;

  @ApiProperty({ description: 'Music ingredient id', required: false })
  @IsEntityId()
  @IsOptional()
  music?: string;

  @ApiProperty({
    description: 'Background music volume (0-100)',
    maximum: VIDEO_STITCH_LIMITS.MAX_MUSIC_VOLUME,
    minimum: VIDEO_STITCH_LIMITS.MIN_MUSIC_VOLUME,
    required: false,
  })
  @IsNumber()
  @Min(VIDEO_STITCH_LIMITS.MIN_MUSIC_VOLUME)
  @Max(VIDEO_STITCH_LIMITS.MAX_MUSIC_VOLUME)
  @IsOptional()
  musicVolume?: number;

  @ApiProperty({
    enum: VideoTransition,
    enumName: 'VideoTransition',
    required: false,
  })
  @IsEnum(VideoTransition)
  @IsOptional()
  transition?: VideoTransition;

  @ApiProperty({
    description: 'Transition duration in seconds',
    maximum: VIDEO_STITCH_LIMITS.MAX_TRANSITION_DURATION,
    minimum: VIDEO_STITCH_LIMITS.MIN_TRANSITION_DURATION,
    required: false,
  })
  @IsNumber()
  @Min(VIDEO_STITCH_LIMITS.MIN_TRANSITION_DURATION)
  @Max(VIDEO_STITCH_LIMITS.MAX_TRANSITION_DURATION)
  @IsOptional()
  transitionDuration?: number;

  @ApiHideProperty()
  @IsEmpty({
    message: 'Transition ease curves are not supported when merging videos',
  })
  transitionEaseCurve?: unknown;
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
    description:
      'Transition, caption and music settings the auto-merge applies (with isMergeEnabled)',
    required: false,
    type: InterpolationMergeSettingsDto,
  })
  @ValidateNested()
  @Type(() => InterpolationMergeSettingsDto)
  @IsOptional()
  mergeSettings?: InterpolationMergeSettingsDto;

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
