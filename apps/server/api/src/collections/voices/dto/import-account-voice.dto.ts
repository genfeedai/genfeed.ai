import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ImportAccountVoiceDto {
  @ApiProperty({
    description: 'ElevenLabs voice ID from the connected account',
    required: true,
  })
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  readonly externalVoiceId!: string;
}
