import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl, Matches } from 'class-validator';

export class CreateTranscriptDto {
  @ApiProperty({
    description: 'YouTube video URL to transcribe',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsNotEmpty()
  @IsUrl()
  @Matches(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/, {
    message: 'Must be a valid YouTube URL',
  })
  youtubeUrl!: string;
}
