import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

export class ImportAccountVoiceDto {
  @ApiProperty({
    description: 'ElevenLabs voice ID from the connected account',
    required: true,
  })
  @IsString()
  @MaxLength(128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  readonly externalVoiceId!: string;
}
