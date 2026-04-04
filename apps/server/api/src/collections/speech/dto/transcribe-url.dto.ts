import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class TranscribeUrlDto {
  @IsUrl()
  @IsNotEmpty()
  @ApiProperty({
    description: 'URL of the audio file to transcribe',
    example: 'https://example.com/audio.mp3',
    required: true,
  })
  readonly url!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Language code for transcription (e.g., "en", "es", "fr")',
    example: 'en',
    required: false,
  })
  readonly language?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional prompt to guide the transcription',
    example: 'This is a podcast about technology',
    required: false,
  })
  readonly prompt?: string;
}
