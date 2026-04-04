import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BotLivestreamTranscriptDto {
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  @ApiProperty({
    description:
      'Pre-transcribed chunk text. Optional when audioUrl is provided.',
    required: false,
  })
  text?: string;

  @IsUrl()
  @IsOptional()
  @ApiProperty({
    description: 'Audio URL to transcribe with the existing speech backend',
    required: false,
  })
  audioUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(16)
  @ApiProperty({
    description: 'Optional ISO language code hint for the speech backend',
    required: false,
  })
  language?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiProperty({
    description: 'Optional transcription prompt/context seed',
    required: false,
  })
  prompt?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  @ApiProperty({
    description: 'Confidence score for a pre-transcribed chunk',
    maximum: 1,
    minimum: 0,
    required: false,
  })
  confidence?: number;
}
