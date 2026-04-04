import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';

const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)/;

export class AnalyzeYoutubeDto {
  @IsUrl()
  @Matches(YOUTUBE_URL_REGEX, {
    message: 'Must be a valid YouTube URL',
  })
  @ApiProperty({
    description: 'YouTube video URL to analyze',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    required: true,
  })
  readonly youtubeUrl!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  @ApiProperty({
    default: 10,
    description: 'Maximum number of highlights to detect',
    required: false,
  })
  readonly maxClips?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'en',
    description: 'Language code for transcription',
    required: false,
  })
  readonly language?: string;

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
    description: 'Optional project name',
    required: false,
  })
  readonly name?: string;
}
