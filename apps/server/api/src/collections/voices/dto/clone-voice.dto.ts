import { VoiceProvider } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CloneVoiceDto {
  @IsString()
  @ApiProperty({
    description: 'Name for the cloned voice',
    required: true,
  })
  readonly name!: string;

  @IsEnum(VoiceProvider)
  @IsOptional()
  @ApiProperty({
    default: VoiceProvider.ELEVENLABS,
    description: 'Voice provider to use for cloning',
    enum: VoiceProvider,
    required: false,
  })
  readonly provider?: VoiceProvider;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'URL to an audio file for cloning (alternative to file upload)',
    required: false,
  })
  readonly audioUrl?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to remove background noise from the audio sample',
    required: false,
  })
  readonly removeBackgroundNoise?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Description of the voice',
    required: false,
  })
  readonly description?: string;
}
