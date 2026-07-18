import {
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/queue-contracts';
import {
  CLIP_RESULT_MODES,
  DEFAULT_CLIP_RESULT_MODE,
  type ClipResultMode,
} from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * YouTube URL pattern — accepts standard watch URLs, short URLs, and embed URLs.
 */
const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)/;

export class CreateClipProjectFromYoutubeDto {
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

  @IsUrl()
  @Matches(YOUTUBE_URL_REGEX, {
    message: 'Must be a valid YouTube URL',
  })
  @ApiProperty({
    description: 'YouTube video URL',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    required: true,
  })
  readonly youtubeUrl!: string;

  @ValidateIf(
    (dto: CreateClipProjectFromYoutubeDto) =>
      (dto.mode ?? DEFAULT_CLIP_RESULT_MODE) === 'avatar',
  )
  @IsString()
  @ApiProperty({
    description: 'Avatar ID for avatar-mode clip generation',
    required: false,
  })
  readonly avatarId?: string;

  @ValidateIf(
    (dto: CreateClipProjectFromYoutubeDto) =>
      (dto.mode ?? DEFAULT_CLIP_RESULT_MODE) === 'avatar',
  )
  @IsString()
  @ApiProperty({
    description: 'Voice ID for avatar-mode clip generation',
    required: false,
  })
  readonly voiceId?: string;

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
  @IsNumber()
  @Min(1)
  @Max(30)
  @ApiProperty({
    default: 10,
    description: 'Maximum number of clips to generate',
    required: false,
  })
  readonly maxClips?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiProperty({
    default: 50,
    description: 'Minimum virality score threshold (1-100)',
    required: false,
  })
  readonly minViralityScore?: number;

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
  @ApiProperty({
    description: 'Optional project name',
    required: false,
  })
  readonly name?: string;
}
