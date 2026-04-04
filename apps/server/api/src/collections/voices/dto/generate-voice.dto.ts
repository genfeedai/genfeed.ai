import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateVoiceDto {
  @IsString()
  @ApiProperty({
    description: 'The text to convert to speech',
    required: true,
  })
  readonly text!: string;

  @IsString()
  @ApiProperty({
    description: 'ElevenLabs voice ID to use for speech synthesis',
    required: true,
  })
  readonly voiceId!: string;

  @IsNumber()
  @IsOptional()
  @Min(0.5)
  @Max(2)
  @ApiProperty({
    default: 1.0,
    description: 'Speech speed multiplier (0.5-2.0)',
    required: false,
  })
  readonly speed?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'If true, wait for generation to complete before returning the result.',
    required: false,
  })
  readonly waitForCompletion?: boolean;
}
