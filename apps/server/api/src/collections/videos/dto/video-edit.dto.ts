import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class VideoEditDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Model to use for video editing',
    required: false,
  })
  readonly model?: string;

  @IsNumber()
  @IsOptional()
  @Min(24)
  @Max(120)
  @ApiProperty({
    default: 60,
    description: 'Target FPS for video upscaling',
    maximum: 60,
    minimum: 24,
    required: false,
  })
  readonly targetFps?: number;

  @IsString()
  @IsOptional()
  @IsEnum(['720p', '1080p', '2k', '4k'])
  @ApiProperty({
    default: '4k',
    description: 'Target resolution for video upscaling',
    enum: ['720p', '1080p', '2k', '4k'],
    required: false,
  })
  readonly targetResolution?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Account ID for the video',
    required: false,
  })
  readonly brand?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({
    description: 'Organization ID for the video',
    required: false,
  })
  readonly organization?: string;
}
