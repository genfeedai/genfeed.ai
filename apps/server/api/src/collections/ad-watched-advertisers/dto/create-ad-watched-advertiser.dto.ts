import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { PaidCreativePlatform } from '@genfeedai/integrations/ads';
import { PAID_CREATIVE_PLATFORMS } from '@genfeedai/integrations/ads';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAdWatchedAdvertiserDto {
  @ApiProperty({
    description:
      'Ad platform whose public transparency archive is polled for this advertiser',
    enum: PAID_CREATIVE_PLATFORMS,
  })
  @IsNotEmpty()
  @IsIn(PAID_CREATIVE_PLATFORMS)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  platform!: PaidCreativePlatform;

  @ApiProperty({
    description:
      'Advertiser handle, page slug, or advertiser id on the selected platform',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9._-]+$/, {
    message:
      'advertiserHandle must contain only letters, numbers, dots, hyphens, or underscores',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    return value.trim().replace(/^@/, '').toLowerCase();
  })
  advertiserHandle!: string;

  @ApiProperty({
    description: 'Display name of the advertiser',
    required: false,
  })
  @IsOptional()
  @IsString()
  advertiserName?: string;

  @ApiProperty({
    description:
      'Platform-native advertiser id, once known from a transparency archive response',
    required: false,
  })
  @IsOptional()
  @IsString()
  externalAdvertiserId?: string;

  @ApiProperty({
    description: 'Brand this watched advertiser is scoped to',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiProperty({
    description:
      'Optional platform credential used to authenticate ingestion. Public transparency archives (Meta, TikTok, Google) need none.',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  credentialId?: string;
}
