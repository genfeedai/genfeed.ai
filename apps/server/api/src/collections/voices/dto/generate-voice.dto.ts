import {
  RouterPriority,
  SPEECH_VOICE_PROVIDERS,
  VoiceProvider,
} from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class GenerateVoiceDto {
  @IsString()
  @ApiProperty({
    description: 'The text to convert to speech',
    required: true,
  })
  readonly text!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  @Matches(/^[a-z0-9][a-z0-9-]*$/i, { each: true })
  @ApiProperty({ required: false, type: [String] })
  readonly requestedSkillSlugs?: string[];

  @IsString()
  @ApiProperty({
    description:
      'Voice to speak with: an ElevenLabs voice id from the Genfeed voice catalog, or a HeyGen Voice id from /heygen/speech-voices',
    required: true,
  })
  readonly voiceId!: string;

  @IsIn(SPEECH_VOICE_PROVIDERS)
  @IsOptional()
  @ApiProperty({
    default: VoiceProvider.ELEVENLABS,
    description: 'The voice catalog `voiceId` belongs to',
    enum: SPEECH_VOICE_PROVIDERS,
    required: false,
  })
  readonly voiceProvider?: VoiceProvider;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  @ApiProperty({
    description:
      'Speech model key; it must speak voices from `voiceProvider`. Omitted, the router picks one.',
    required: false,
  })
  readonly model?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description:
      'Route to the best speech model for the voice. If true, `model` is ignored.',
    required: false,
  })
  readonly autoSelectModel?: boolean;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    description:
      'Priority for auto model routing: quality, speed, cost, or balanced.',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  @ApiProperty({
    description: 'Confirmed agent action identity for durable reconciliation',
    required: false,
  })
  readonly sourceActionId?: string;

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
