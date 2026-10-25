import { ClipperProjectStatus } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { OrganizationalCreateDto } from '@api/shared/dto/base/base.dto';
import {
  CLIPPER_PROCESSING_FLOWS,
  CLIPPER_RESULT_MODES,
  type ClipProcessingFlow,
  type ClipperReferenceFrameSet,
  type ClipperResultMode,
  DEFAULT_CLIP_RESULT_MODE,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
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

export class ClipperProjectSettingsDto {
  @IsOptional()
  @IsIn([...CLIPPER_RESULT_MODES])
  @ApiProperty({
    default: DEFAULT_CLIP_RESULT_MODE,
    description: 'Clip generation mode',
    enum: CLIPPER_RESULT_MODES,
    enumName: 'ClipperResultMode',
    required: false,
  })
  readonly mode?: ClipperResultMode;

  @IsOptional()
  @IsIn(CLIPPER_PROCESSING_FLOWS)
  @ApiProperty({
    default: 'quick',
    description: 'Clip processing workflow',
    enum: CLIPPER_PROCESSING_FLOWS,
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

export class CreateClipperProjectDto extends OrganizationalCreateDto {
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
    description:
      'Canonical URL of an organization-owned Library video. Use ingestion routes for new sources.',
    required: true,
  })
  readonly sourceVideoUrl!: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Stored key of an organization-owned Library video; must match sourceVideoUrl when both are supplied.',
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
  @IsIn([...ClipperProjectStatus])
  @ApiProperty({
    description: 'Project processing status',
    enum: ClipperProjectStatus,
    enumName: 'ClipperProjectStatus',
    required: false,
  })
  readonly status?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClipperProjectSettingsDto)
  @ApiProperty({
    description: 'Clip generation settings',
    required: false,
    type: ClipperProjectSettingsDto,
  })
  readonly settings?: ClipperProjectSettingsDto;

  @IsOptional()
  @IsObject()
  @ApiProperty({
    description:
      'Versioned source-video reference-frame candidates and selection state',
    required: false,
    type: Object,
  })
  readonly referenceFrames?: ClipperReferenceFrameSet;
}
