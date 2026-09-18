import {
  LIVE_SESSION_MAX_CEILING_SECONDS,
  LIVE_SESSION_MIN_CEILING_SECONDS,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLiveSessionDto {
  @IsString()
  @MinLength(1)
  @ApiProperty({
    description: 'Realtime video model key reserved before connect',
    example: 'fal/minimax/h3-max/director',
  })
  readonly model!: string;

  @Type(() => Number)
  @IsInt()
  @Min(LIVE_SESSION_MIN_CEILING_SECONDS)
  @Max(LIVE_SESSION_MAX_CEILING_SECONDS)
  @ApiProperty({
    description:
      'User-selected session length ceiling in seconds. Credits reserve for this quantity before the provider is contacted.',
    example: 900,
    maximum: LIVE_SESSION_MAX_CEILING_SECONDS,
    minimum: LIVE_SESSION_MIN_CEILING_SECONDS,
  })
  readonly ceilingSeconds!: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Output resolution. 1080P bills at 2× the standard rate.',
    example: '768P',
    required: false,
  })
  readonly resolution?: string;
}
