import { DefaultAvatarRefDto } from '@api/shared/default-avatar-ref/default-avatar-ref.dto';
import { DefaultVoiceRefDto } from '@api/shared/default-voice-ref/default-voice-ref.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export const AVATAR_VIDEO_ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const;
export type AvatarVideoAspectRatio =
  (typeof AVATAR_VIDEO_ASPECT_RATIOS)[number];

export class CreateAvatarVideoDto {
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
}
