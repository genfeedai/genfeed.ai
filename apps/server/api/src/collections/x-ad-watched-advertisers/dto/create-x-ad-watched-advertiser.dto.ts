import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateXAdWatchedAdvertiserDto {
  @ApiProperty({
    description: 'X (Twitter) handle of the advertiser to watch',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(15)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'advertiserHandle must contain only X username letters, numbers, or underscores',
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
      'X Ads Repository advertiser id, once known from an export report',
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
    description: 'X credential used to authenticate ingestion',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  credentialId?: string;
}
