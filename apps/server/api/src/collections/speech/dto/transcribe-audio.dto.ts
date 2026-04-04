import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TranscribeAudioDto {
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
