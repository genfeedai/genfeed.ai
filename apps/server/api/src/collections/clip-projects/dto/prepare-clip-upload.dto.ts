import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  CLIP_PROCESSING_FLOWS,
  CLIP_RESULT_MODES,
  type ClipProcessingFlow,
  type ClipResultMode,
  DEFAULT_CLIP_RESULT_MODE,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
  type SupportedAvatarVideoProviderName,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_CLIP_SOURCE_SIZE_BYTES = 10 * 1024 * 1024 * 1024;

export class PrepareClipUploadDto {
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Original local filename' })
  readonly filename!: string;

  @IsString()
  @Matches(/^(audio|video)\/[a-zA-Z0-9.+-]+$/, {
    message: 'contentType must be an audio or video MIME type',
  })
  @ApiProperty({ example: 'video/mp4' })
  readonly contentType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_CLIP_SOURCE_SIZE_BYTES)
  @ApiProperty({ maximum: MAX_CLIP_SOURCE_SIZE_BYTES, minimum: 1 })
  readonly sizeBytes!: number;

  @IsOptional()
  @IsIn(CLIP_PROCESSING_FLOWS)
  @ApiProperty({
    default: 'quick',
    enum: CLIP_PROCESSING_FLOWS,
    enumName: 'ClipProcessingFlow',
    required: false,
  })
  readonly flow?: ClipProcessingFlow;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly brandId?: string;

  @IsOptional()
  @IsIn([...CLIP_RESULT_MODES])
  @ApiProperty({
    default: DEFAULT_CLIP_RESULT_MODE,
    enum: CLIP_RESULT_MODES,
    enumName: 'ClipResultMode',
    required: false,
  })
  readonly mode?: ClipResultMode;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly avatarId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  readonly voiceId?: string;

  @IsOptional()
  @IsIn(SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES)
  @ApiProperty({
    default: 'heygen',
    enum: SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
    required: false,
  })
  readonly avatarProvider?: SupportedAvatarVideoProviderName;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @ApiProperty({ default: 10, required: false })
  readonly maxClips?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @ApiProperty({ default: 50, required: false })
  readonly minViralityScore?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ default: 'en', required: false })
  readonly language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @ApiProperty({ required: false })
  readonly name?: string;
}
