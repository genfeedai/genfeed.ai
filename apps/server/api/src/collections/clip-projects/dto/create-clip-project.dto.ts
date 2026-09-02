import { ClipProjectStatus } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { OrganizationalCreateDto } from '@api/shared/dto/base/base.dto';
import {
  CLIP_PROCESSING_FLOWS,
  CLIP_RESULT_MODES,
  type ClipProcessingFlow,
  type ClipReferenceFrameSet,
  type ClipResultMode,
  DEFAULT_CLIP_RESULT_MODE,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ClipProjectSettingsDto {
  @IsOptional()
  @IsIn([...CLIP_RESULT_MODES])
  @ApiProperty({
    default: DEFAULT_CLIP_RESULT_MODE,
    description: 'Clip generation mode',
    enum: CLIP_RESULT_MODES,
    enumName: 'ClipResultMode',
    required: false,
  })
  readonly mode?: ClipResultMode;

  @IsOptional()
  @IsIn(CLIP_PROCESSING_FLOWS)
  @ApiProperty({
    default: 'quick',
    description: 'Clip processing workflow',
    enum: CLIP_PROCESSING_FLOWS,
    enumName: 'ClipProcessingFlow',
    required: false,
  })
  readonly flow?: ClipProcessingFlow;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Avatar ID for avatar-mode clip generation',
    required: false,
  })
  readonly avatarId?: string;

  @IsOptional()
  @IsIn(SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES)
  @ApiProperty({
    default: 'heygen',
    description: 'Avatar video provider to use',
    enum: SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
    required: false,
  })
  readonly avatarProvider?: SupportedAvatarVideoProviderName;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Voice ID for avatar-mode clip generation',
    required: false,
  })
  readonly voiceId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'en',
    description: 'Source transcription language',
    required: false,
  })
  readonly language?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiProperty({
    default: 50,
    description: 'Minimum highlight virality score',
    required: false,
  })
  readonly minViralityScore?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: true,
    description: 'Whether generated clips should include captions',
    required: false,
  })
  readonly addCaptions?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(300)
  @ApiProperty({
    default: 15,
    description: 'Minimum clip duration in seconds',
    required: false,
  })
  readonly minDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(600)
  @ApiProperty({
    default: 90,
    description: 'Maximum clip duration in seconds',
    required: false,
  })
  readonly maxDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @ApiProperty({
    default: 10,
    description: 'Maximum number of clips to generate',
    required: false,
  })
  readonly maxClips?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: '9:16',
    description: 'Output aspect ratio',
    required: false,
  })
  readonly aspectRatio?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'default',
    description: 'Caption style preset',
    required: false,
  })
  readonly captionStyle?: string;
}

export class CreateClipProjectDto extends OrganizationalCreateDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Brand context for clip identity and downstream ownership',
    required: false,
  })
  readonly brandId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: '',
    description: 'Project name',
    required: false,
  })
  readonly name?: string;

  @IsUrl()
  @ApiProperty({
    description: 'Source video URL',
    required: true,
  })
  readonly sourceVideoUrl!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'S3 key for the source video',
    required: false,
  })
  readonly sourceVideoS3Key?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'en',
    description: 'Language code for transcription',
    required: false,
  })
  readonly language?: string;

  @IsOptional()
  @IsString()
  @IsIn([...ClipProjectStatus])
  @ApiProperty({
    description: 'Project processing status',
    enum: ClipProjectStatus,
    enumName: 'ClipProjectStatus',
    required: false,
  })
  readonly status?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClipProjectSettingsDto)
  @ApiProperty({
    description: 'Clip generation settings',
    required: false,
    type: ClipProjectSettingsDto,
  })
  readonly settings?: ClipProjectSettingsDto;

  @IsOptional()
  @IsObject()
  @ApiProperty({
    description:
      'Versioned source-video reference-frame candidates and selection state',
    required: false,
    type: Object,
  })
  readonly referenceFrames?: ClipReferenceFrameSet;
}
