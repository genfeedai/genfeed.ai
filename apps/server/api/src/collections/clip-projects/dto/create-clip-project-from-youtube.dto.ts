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
} from 'class-validator';

/**
 * YouTube URL pattern — accepts standard watch URLs, short URLs, and embed URLs.
 */
const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)/;

const AVATAR_PROVIDERS = ['heygen', 'did', 'tavus', 'musetalk'] as const;

export class CreateClipProjectFromYoutubeDto {
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

  @IsString()
  @ApiProperty({
    description: 'Avatar ID for clip generation',
    required: true,
  })
  readonly avatarId!: string;

  @IsString()
  @ApiProperty({
    description: 'Voice ID for clip generation',
    required: true,
  })
  readonly voiceId!: string;

  @IsOptional()
  @IsIn(AVATAR_PROVIDERS)
  @ApiProperty({
    default: 'heygen',
    description: 'Avatar video provider to use',
    enum: AVATAR_PROVIDERS,
    required: false,
  })
  readonly avatarProvider?: (typeof AVATAR_PROVIDERS)[number];

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
