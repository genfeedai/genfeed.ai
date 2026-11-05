import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

export class CreatePublicYoutubeClipperDto {
  @ApiProperty({
    description: 'Public YouTube video URL to analyze.',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    maxLength: 2048,
  })
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  readonly youtubeUrl!: string;
}

export class CreatePublicYoutubeClipperPreviewDto {
  @ApiPropertyOptional({
    description:
      'Recommendation to render. Defaults to the highest-ranked recommendation.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  readonly recommendationId?: string;
}
