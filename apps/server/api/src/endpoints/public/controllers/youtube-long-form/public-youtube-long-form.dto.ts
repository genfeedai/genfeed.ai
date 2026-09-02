import { PUBLIC_YOUTUBE_LONG_FORM_OUTPUT_TYPES } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreatePublicYoutubeLongFormDto {
  @ApiProperty({
    enum: PUBLIC_YOUTUBE_LONG_FORM_OUTPUT_TYPES,
    example: 'linkedin-article',
  })
  @IsString()
  @IsIn(PUBLIC_YOUTUBE_LONG_FORM_OUTPUT_TYPES)
  readonly outputType!: (typeof PUBLIC_YOUTUBE_LONG_FORM_OUTPUT_TYPES)[number];

  @ApiProperty({
    description: 'Public YouTube video URL to transform.',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    maxLength: 2048,
  })
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  readonly youtubeUrl!: string;
}
