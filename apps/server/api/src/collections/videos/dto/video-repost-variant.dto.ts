import { REPOST_VARIANT_LIMITS } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** The changes a repost variant applies in one new version of a video. */
export class VideoRepostVariantDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ description: 'Flip left to right', required: false })
  readonly isMirrored?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(REPOST_VARIANT_LIMITS.maxSpeed)
  @ApiProperty({ description: 'Playback speed, 1 keeps it', required: false })
  readonly speed?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(REPOST_VARIANT_LIMITS.maxZoom)
  @ApiProperty({
    description: 'Centre crop-in factor, 1 keeps the frame',
    required: false,
  })
  readonly zoom?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(REPOST_VARIANT_LIMITS.maxTrimStartSeconds)
  @ApiProperty({
    description: 'Seconds to cut from the start of the video',
    required: false,
  })
  readonly trimStartSeconds?: number;
}
