import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class DarkroomGenerateVoiceDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Persona slug (optional)', required: false })
  readonly personaSlug?: string;

  @IsString()
  @ApiProperty({ description: 'Text to convert to speech' })
  readonly text!: string;

  @IsString()
  @ApiProperty({ description: 'ElevenLabs voice ID' })
  readonly voiceId!: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Speech speed multiplier (0.5 to 2.0)',
    required: false,
  })
  readonly speed?: number;
}
