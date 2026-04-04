import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import {
  IngredientCategory,
  ModelKey,
  RouterPriority,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/enums';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateVideoWithCaptionsDto {
  @IsMongoId()
  @ApiProperty({ required: true })
  readonly caption?: Types.ObjectId;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly language?: string;
}

export class CreateMergedVideoDto {
  @IsString()
  @IsEnum(IngredientCategory)
  @ApiProperty({
    enum: IngredientCategory,
    enumName: 'IngredientCategory',
    required: true,
  })
  readonly category!: IngredientCategory;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly music?: Types.ObjectId;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly isCaptionsEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly isUpscaleEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly isResizeEnabled?: boolean;

  @IsEnum(VideoTransition)
  @IsOptional()
  @ApiProperty({
    default: VideoTransition.NONE,
    description: 'Transition effect between video clips',
    enum: VideoTransition,
    enumName: 'VideoTransition',
    required: false,
  })
  readonly transition?: VideoTransition;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(2)
  @ApiProperty({
    default: 0.5,
    description: 'Transition duration in seconds',
    maximum: 2,
    minimum: 0.1,
    required: false,
  })
  readonly transitionDuration?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Mute original video audio',
    required: false,
  })
  readonly isMuteVideoAudio?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  @ApiProperty({
    default: 50,
    description: 'Background music volume (0-100)',
    maximum: 100,
    minimum: 0,
    required: false,
  })
  readonly musicVolume?: number;

  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ required: true })
  readonly ids!: string[];

  @IsEnum(VideoEaseCurve)
  @IsOptional()
  @ApiProperty({
    description: 'Ease curve for zoom effects (Ken Burns)',
    enum: VideoEaseCurve,
    enumName: 'VideoEaseCurve',
    required: false,
  })
  readonly zoomEaseCurve?: VideoEaseCurve;

  @IsEnum(VideoEaseCurve)
  @IsOptional()
  @ApiProperty({
    description: 'Ease curve for transitions between videos',
    enum: VideoEaseCurve,
    enumName: 'VideoEaseCurve',
    required: false,
  })
  readonly transitionEaseCurve?: VideoEaseCurve;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ZoomConfigDto)
  @ApiProperty({
    description: 'Per-video zoom configuration',
    required: false,
    type: [Object],
  })
  readonly zoomConfigs?: ZoomConfigDto[];
}

export class AutoGenerateMusicDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Prompt describing the music to generate',
    required: false,
  })
  readonly prompt?: string;

  @IsNumber()
  @IsOptional()
  @Min(4)
  @Max(90)
  @ApiProperty({
    description:
      'Duration of the music in seconds (will match video duration if not specified)',
    maximum: 90,
    minimum: 4,
    required: false,
  })
  readonly duration?: number;
}

export class BackgroundMusicDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description:
      'ID of an existing music ingredient to use as background music',
    required: false,
  })
  readonly ingredientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AutoGenerateMusicDto)
  @ApiProperty({
    description: 'Options for auto-generating background music',
    required: false,
    type: () => AutoGenerateMusicDto,
  })
  readonly autoGenerate?: AutoGenerateMusicDto;
}

export class ZoomConfigDto {
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(5)
  @ApiProperty({
    default: 1.0,
    description: 'Starting zoom level (1.0 = no zoom)',
    required: false,
  })
  readonly startZoom?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(5)
  @ApiProperty({
    default: 1.2,
    description: 'Ending zoom level (1.0 = no zoom)',
    required: false,
  })
  readonly endZoom?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Starting X position for panning (0-1, normalized)',
    required: false,
  })
  readonly startX?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Starting Y position for panning (0-1, normalized)',
    required: false,
  })
  readonly startY?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Ending X position for panning (0-1, normalized)',
    required: false,
  })
  readonly endX?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Ending Y position for panning (0-1, normalized)',
    required: false,
  })
  readonly endY?: number;
}

export class CreateVideoDto extends OmitType(CreateIngredientDto, [
  'metadata',
]) {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The language code for the video content',
    required: false,
    type: String,
  })
  readonly language?: string;

  @ValidateNested()
  @IsOptional()
  @Type(() => CreateMetadataDto)
  @ApiProperty({
    description: 'Optional metadata associated with the video',
    required: false,
    type: () => CreateMetadataDto,
  })
  readonly metadata?: CreateMetadataDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => {
    // Ensure blacklist is always an array
    if (value === undefined || value === null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    // If it's a string, split by comma or wrap in array
    if (typeof value === 'string') {
      return value.includes(',')
        ? value.split(',').map((v) => v.trim())
        : [value];
    }
    return [value];
  })
  @ApiProperty({
    description:
      'Array of blacklist element keys to exclude from video generation',
    required: false,
    type: [String],
  })
  readonly blacklist?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => {
    // Ensure sounds is always an array
    if (value === undefined || value === null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    // If it's a string, split by comma or wrap in array
    if (typeof value === 'string') {
      return value.includes(',')
        ? value.split(',').map((v) => v.trim())
        : [value];
    }
    return [value];
  })
  @ApiProperty({
    description: 'Array of sound element keys to include in video generation',
    required: false,
    type: [String],
  })
  readonly sounds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(4)
  @Max(60)
  @ApiProperty({
    default: 10,
    description: 'Duration in seconds',
    maximum: 60,
    minimum: 4,
    required: false,
  })
  readonly duration?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Resolution for video generation',
    enum: ['720p', '1080p'],
    required: false,
  })
  readonly resolution?: string;

  @IsOptional()
  @IsIn(['off', 'brand'])
  @ApiProperty({
    default: 'off',
    description: 'Brand context mode for prompt assembly',
    enum: ['off', 'brand'],
    required: false,
  })
  readonly brandingMode?: 'off' | 'brand';

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to include branding in the video',
    required: false,
  })
  readonly isBrandingEnabled?: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    default: 60,
    description: 'Target FPS for video upscaling',
    required: false,
  })
  readonly targetFps?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: '4k',
    description: 'Target resolution for video upscaling',
    enum: ['720p', '1080p', '4k'],
    required: false,
  })
  readonly targetResolution?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Speech text for Google Veo3 models',
    required: false,
  })
  readonly speech?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The model to use for video generation',
    enum: ModelKey,
    enumName: 'ModelKey',
    required: false,
  })
  readonly model?: ModelKey;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Automatically select the best model based on the prompt. If true, the model parameter will be ignored.',
    required: false,
  })
  readonly autoSelectModel?: boolean;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    description:
      'Priority for auto model routing: quality, speed, cost, or balanced.',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The width of the generated video in pixels',
    required: false,
  })
  readonly width?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The height of the generated video in pixels',
    required: false,
  })
  readonly height?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The style for video generation',
    required: false,
  })
  readonly style?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The mood for video generation',
    required: false,
  })
  readonly mood?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The camera angle for video generation',
    required: false,
  })
  readonly camera?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The scene for video generation',
    required: false,
  })
  readonly scene?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The lighting for video generation',
    required: false,
  })
  readonly lighting?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The lens type for video generation',
    required: false,
  })
  readonly lens?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The camera movement for video generation',
    required: false,
  })
  readonly cameraMovement?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The font family for video captions/text',
    required: false,
  })
  readonly fontFamily?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The format for video generation',
    required: false,
  })
  readonly format?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Whether to include audio in the video',
    required: false,
  })
  readonly isAudioEnabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(4)
  @ApiProperty({
    default: 1,
    description: 'Number of videos to generate (multi-output models only)',
    maximum: 4,
    minimum: 1,
    required: false,
  })
  readonly outputs?: number;

  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'The bookmark ID that this video was generated from',
    required: false,
  })
  readonly bookmark?: string | Types.ObjectId;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Prompt template key (e.g., "video.cinematic.default")',
    required: false,
  })
  readonly promptTemplate?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to use prompt templates',
    required: false,
  })
  readonly useTemplate?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'If true, wait for generation to complete before returning the result. Defaults to false (returns immediately with placeholder).',
    required: false,
  })
  readonly waitForCompletion?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'The end frame image ID for video interpolation. When provided with a reference image, generates video that interpolates between the start and end frames.',
    required: false,
  })
  readonly endFrame?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Audio file URL for avatar/talking-head generation (Kling Avatar V2). Duration matches audio length.',
    required: false,
  })
  readonly audioUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BackgroundMusicDto)
  @ApiProperty({
    description:
      'Background music options. Provide either an existing music ingredient ID or auto-generate settings.',
    required: false,
    type: () => BackgroundMusicDto,
  })
  readonly backgroundMusic?: BackgroundMusicDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  @ApiProperty({
    default: 30,
    description:
      'Background music volume (0-100). Only used when backgroundMusic is provided.',
    maximum: 100,
    minimum: 0,
    required: false,
  })
  readonly musicVolume?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Mute the original video audio when adding background music',
    required: false,
  })
  readonly muteVideoAudio?: boolean;
}
