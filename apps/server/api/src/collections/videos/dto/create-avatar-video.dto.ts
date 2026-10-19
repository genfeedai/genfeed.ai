import { DefaultAvatarRefDto } from '@api/shared/default-avatar-ref/default-avatar-ref.dto';
import { DefaultVoiceRefDto } from '@api/shared/default-voice-ref/default-voice-ref.dto';
import { RouterPriority } from '@genfeedai/contracts';
import {
  AVATAR_VIDEO_ASPECT_RATIOS,
  type AvatarVideoAspectRatio,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateAvatarVideoDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Authorized photo ingredient' })
  readonly photoIngredientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultAvatarRefDto)
  @ApiProperty({ type: DefaultAvatarRefDto, required: false })
  readonly avatarRef?: DefaultAvatarRefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultVoiceRefDto)
  @ApiProperty({ type: DefaultVoiceRefDto, required: false })
  readonly voiceRef?: DefaultVoiceRefDto;

  @IsOptional()
  @IsString()
  @ApiProperty({
    required: false,
    description: 'Authorized saved narration ingredient',
  })
  readonly audioIngredientId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'HeyGen avatar ID (optional if photoUrl provided)',
    required: false,
  })
  readonly avatarId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Custom photo URL (optional if avatarId provided)',
    required: false,
  })
  readonly photoUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'ElevenLabs voice ID',
    required: false,
  })
  readonly elevenlabsVoiceId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Text for text-to-speech',
    required: false,
  })
  readonly text?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Pre-generated audio URL',
    required: false,
  })
  readonly audioUrl?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'HeyGen voice ID (alternative to ElevenLabs)',
    required: false,
  })
  readonly heygenVoiceId?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @ApiProperty({
    default: false,
    description:
      'Use default identity (avatar photo + voice) from org settings',
    required: false,
  })
  readonly useIdentity?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Cloned voice ingredient ID (overrides elevenlabsVoiceId)',
    required: false,
  })
  readonly clonedVoiceId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Voice provider for the cloned voice',
    required: false,
  })
  readonly voiceProvider?: string;

  @IsIn(AVATAR_VIDEO_ASPECT_RATIOS)
  @IsOptional()
  @ApiProperty({
    description: 'Output aspect ratio for the generated avatar video',
    enum: AVATAR_VIDEO_ASPECT_RATIOS,
    required: false,
  })
  readonly aspectRatio?: AvatarVideoAspectRatio;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Avatar engine model (`heygen/avatar-iv` or `heygen/avatar-v`). Ignored when autoSelectModel is true.',
    required: false,
  })
  readonly model?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description:
      'Route to the best engine the selected look supports. Defaults to true when no model is given.',
    required: false,
  })
  readonly autoSelectModel?: boolean;

  @IsEnum(RouterPriority)
  @IsOptional()
  @ApiProperty({
    default: RouterPriority.BALANCED,
    description:
      'Priority for auto engine routing: quality, speed, cost, or balanced.',
    enum: RouterPriority,
    enumName: 'RouterPriority',
    required: false,
  })
  readonly prioritize?: RouterPriority;
}
