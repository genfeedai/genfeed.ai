import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GenerateLipSyncDto {
  @IsString()
  @ApiProperty({ description: 'Persona slug' })
  readonly personaSlug!: string;

  @IsString()
  @ApiProperty({ description: 'Source image URL for the character face' })
  readonly imageUrl!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Audio URL to lip sync to', required: false })
  readonly audioUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Text to generate TTS audio from (alternative to audioUrl)',
    required: false,
  })
  readonly text?: string;
}
