import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { Platform } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Distribution channels supported by the launch-kit copy generator.
 * A subset of `Platform` — the dev-native launch surfaces that have channel
 * conventions distinct enough to warrant bespoke copy generation.
 */
export const LAUNCH_COPY_CHANNELS = [
  Platform.HACKER_NEWS,
  Platform.PRODUCT_HUNT,
] as const;

export type LaunchCopyChannel = (typeof LAUNCH_COPY_CHANNELS)[number];

export class GenerateLaunchCopyDto {
  @ApiProperty({
    description: 'Target launch channel',
    enum: LAUNCH_COPY_CHANNELS,
    example: Platform.HACKER_NEWS,
  })
  @IsIn(LAUNCH_COPY_CHANNELS)
  readonly channel!: LaunchCopyChannel;

  @ApiProperty({ description: 'Product / project name' })
  @IsString()
  @IsNotEmpty()
  readonly productName!: string;

  @ApiProperty({ description: 'What the product does, in plain language' })
  @IsString()
  @IsNotEmpty()
  readonly description!: string;

  @ApiProperty({ description: 'Landing page or repo URL', required: false })
  @IsString()
  @IsOptional()
  readonly url?: string;

  @ApiProperty({ description: 'Brand the launch belongs to' })
  @IsEntityId()
  readonly brandId!: string;

  @ApiProperty({
    description: 'Number of tagline variants to produce (Product Hunt)',
    maximum: 5,
    minimum: 1,
    required: false,
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(5)
  readonly variationsCount?: number;
}
