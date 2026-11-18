import {
  HEYGEN_AVATAR_MOTION_EXPRESSIVENESS,
  HEYGEN_AVATAR_MOTION_PROMPT_MAX_LENGTH,
} from '@genfeedai/contracts/constants';
import type { HeyGenAvatarMotionExpressiveness } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AvatarMotionDto {
  @IsIn(HEYGEN_AVATAR_MOTION_EXPRESSIVENESS)
  @IsOptional()
  @ApiProperty({
    description:
      'How much the avatar moves. `less` gives fewer, calmer gestures; it does not turn motion off. Avatar 6 and Avatar 6 Turbo only.',
    enum: HEYGEN_AVATAR_MOTION_EXPRESSIVENESS,
    required: false,
  })
  readonly expressiveness?: HeyGenAvatarMotionExpressiveness;

  @IsString()
  @MaxLength(HEYGEN_AVATAR_MOTION_PROMPT_MAX_LENGTH)
  @IsOptional()
  @ApiProperty({
    description:
      'Plain-language direction for gestures, expression and posture. Overrides expressiveness where the two overlap. Avatar 6 and Avatar 6 Turbo only.',
    maxLength: HEYGEN_AVATAR_MOTION_PROMPT_MAX_LENGTH,
    required: false,
  })
  readonly prompt?: string;
}
