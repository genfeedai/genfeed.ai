import { CreateMediaGenerationDto } from '@api/collections/ingredients/dto/create-media-generation.dto';
import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { CrunVideoQuoteControlsDto } from '@api/collections/videos/dto/create-crun-video-quote.dto';
import { toCommaSeparatedStrings } from '@api/helpers/dto/comma-separated-strings.transform';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  BeatSyncCutStrategy,
  IngredientCategory,
  VideoTransition,
} from '@genfeedai/contracts';
import type { AdPresetSubmission } from '@genfeedai/contracts/api-types/contracts/ad-preset.contract';
import { BEAT_SYNC_CUT_STRATEGIES } from '@genfeedai/contracts/interfaces';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmpty,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateVideoWithCaptionsDto {
  @IsEntityId()
  @ApiProperty({ required: true })
  readonly caption?: string;

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

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly music?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description:
      'Trim each clip so the cuts land on the beat of the music. Needs music and plain cuts.',
    required: false,
  })
  readonly isBeatSyncEnabled?: boolean;

  @IsIn(BEAT_SYNC_CUT_STRATEGIES)
  @IsOptional()
  @ApiProperty({
    default: BeatSyncCutStrategy.EVERY_BEAT,
    description: 'Which beats a cut may land on',
    enum: [...BEAT_SYNC_CUT_STRATEGIES],
    enumName: 'BeatSyncCutStrategy',
    required: false,
  })
  readonly beatSyncCutStrategy?: BeatSyncCutStrategy;

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

  @IsEmpty({ message: 'Zoom effects are not supported when merging videos' })
  @ApiHideProperty()
  readonly zoomEaseCurve?: unknown;

  @IsEmpty({
    message: 'Transition ease curves are not supported when merging videos',
  })
  @ApiHideProperty()
  readonly transitionEaseCurve?: unknown;

  @IsEmpty({ message: 'Zoom effects are not supported when merging videos' })
  @ApiHideProperty()
  readonly zoomConfigs?: unknown;
}

export class CreateVideoDto extends CreateMediaGenerationDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ApiProperty({
    description:
      'Saved ad preset and typed parameters. Reference audio steers the voice; there is no unchanged-audio guarantee.',
    required: false,
  })
  readonly adPreset?: AdPresetSubmission;

  // Retain unsupported mask inputs for explicit preset validation instead of whitelist stripping.
  @ValidateIf((dto: CreateVideoDto) => dto.adPreset !== undefined)
  @IsEmpty({ message: 'Ad presets do not support edit-mask token bindings' })
  @ApiHideProperty()
  readonly maskId?: unknown;

  @ValidateIf((dto: CreateVideoDto) => dto.adPreset !== undefined)
  @IsEmpty({ message: 'Ad presets do not support edit-mask token bindings' })
  @ApiHideProperty()
  readonly editMask?: unknown;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  readonly crunQuoteId?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @ValidateNested()
  @Type(() => CrunVideoQuoteControlsDto)
  readonly crunControls?: CrunVideoQuoteControlsDto;

  // Video generation only generates the video: background music is an
  // editing action that belongs in the Studio editor's audio tracks now, not
  // a generation-time option. Removing the fields is enough — the pipe's
  // default `whitelist: true` already strips any undeclared property
  // (`backgroundMusic`/`musicVolume`/`muteVideoAudio` included) before this
  // class ever sees it. This DTO does NOT opt into `FORBID_NON_WHITELISTED`:
  // real callers (Studio's generation payload, the MCP `createVideo` tool)
  // routinely send other undeclared fields the server has always tolerated
  // by dropping them, and forbidding non-whitelisted properties would turn
  // every one of those into a hard 400 instead of a no-op.
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Video generation prompt', required: false })
  readonly text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Source image ingredient IDs used as still references',
    required: false,
    type: [String],
  })
  readonly references?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEntityId({ each: true })
  @ApiProperty({
    description:
      'Stored video ingredient IDs used as native video references by supported models',
    required: false,
    type: [String],
  })
  readonly videoReferences?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsEntityId({ each: true })
  @ApiProperty({
    description: 'Stored audio ingredient IDs for reviewed video models',
    required: false,
    type: [String],
  })
  readonly audioReferences?: string[];

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
  @Transform(toCommaSeparatedStrings)
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
  @Transform(toCommaSeparatedStrings)
  @ApiProperty({
    description: 'Array of sound element keys to include in video generation',
    required: false,
    type: [String],
  })
  readonly sounds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  @ApiProperty({
    default: 10,
    description: 'Duration in seconds',
    maximum: 60,
    minimum: 1,
    required: false,
  })
  readonly duration?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Model-specific video resolution from the selected model capability list',
    required: false,
  })
  readonly resolution?: string;

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
    type: String,
    required: false,
  })
  readonly model?: string;

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
  @MaxLength(400)
  @ApiProperty({
    description: 'Who or what the video is about',
    required: false,
  })
  readonly subject?: string;

  @IsString()
  @IsOptional()
  @MaxLength(400)
  @ApiProperty({
    description: 'What the subject does',
    required: false,
  })
  readonly action?: string;

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

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Marks the request as a Studio draft (a cheap preview). Stored on the output; it does not change the price.',
    required: false,
  })
  readonly isDraft?: boolean;

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
  @IsEntityId()
  @ApiProperty({
    description: 'The bookmark ID that this video was generated from',
    required: false,
  })
  readonly bookmark?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Prompt template key (e.g., "video.cinematic.default")',
    required: false,
  })
  readonly promptTemplate?: string;

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
}
