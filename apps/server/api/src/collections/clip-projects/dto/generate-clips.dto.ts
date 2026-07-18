import {
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/queue-contracts';
import {
  CLIP_RESULT_MODES,
  DEFAULT_CLIP_RESULT_MODE,
  type ClipResultMode,
} from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class GenerateClipHighlightDto {
  @IsString()
  @ApiProperty({
    description: 'Highlight ID',
    required: true,
  })
  readonly id!: string;

  @IsString()
  @ApiProperty({
    description: 'Highlight title to use for generation',
    required: true,
  })
  readonly title!: string;

  @IsString()
  @ApiProperty({
    description: 'Highlight script/summary to use for generation',
    required: true,
  })
  readonly summary!: string;
}

export class GenerateClipsDto {
  @IsOptional()
  @IsIn([...CLIP_RESULT_MODES])
  @ApiProperty({
    default: DEFAULT_CLIP_RESULT_MODE,
    description: 'Clip generation mode',
    enum: CLIP_RESULT_MODES,
    enumName: 'ClipResultMode',
    required: false,
  })
  readonly mode?: ClipResultMode;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @ApiProperty({
    description: 'IDs of selected highlights to generate clips from',
    example: ['uuid-1', 'uuid-2'],
    required: true,
    type: [String],
  })
  readonly selectedHighlightIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GenerateClipHighlightDto)
  @ApiProperty({
    description: 'Edited highlight payloads to persist before generation',
    required: true,
    type: [GenerateClipHighlightDto],
  })
  readonly editedHighlights!: GenerateClipHighlightDto[];

  @ValidateIf(
    (dto: GenerateClipsDto) =>
      (dto.mode ?? DEFAULT_CLIP_RESULT_MODE) === 'avatar',
  )
  @IsString()
  @ApiProperty({
    description: 'Avatar ID for avatar-mode clip generation',
    required: false,
  })
  readonly avatarId?: string;

  @ValidateIf(
    (dto: GenerateClipsDto) =>
      (dto.mode ?? DEFAULT_CLIP_RESULT_MODE) === 'avatar',
  )
  @IsString()
  @ApiProperty({
    description: 'Voice ID for avatar-mode clip generation',
    required: false,
  })
  readonly voiceId?: string;

  @IsOptional()
  @IsIn(SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES)
  @ApiProperty({
    default: 'heygen',
    description: 'Avatar video provider to use',
    enum: SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
    required: false,
  })
  readonly avatarProvider?: SupportedAvatarVideoProviderName;
}
