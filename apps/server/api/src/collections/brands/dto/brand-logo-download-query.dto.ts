import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import {
  BRAND_LOGO_DOWNLOAD_DEFAULT_SIZE,
  BRAND_LOGO_DOWNLOAD_FORMATS,
  BRAND_LOGO_DOWNLOAD_MAX_SIZE,
  BRAND_LOGO_DOWNLOAD_MIN_SIZE,
  type BrandLogoDownloadFormat,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

const DIGITS_ONLY_PATTERN = /^[0-9]+$/;

/** A logo download: the file format and, for PNG and WEBP, the longest side. */
export class BrandLogoDownloadQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @IsIn(BRAND_LOGO_DOWNLOAD_FORMATS)
  @ApiProperty({ enum: BRAND_LOGO_DOWNLOAD_FORMATS })
  format: BrandLogoDownloadFormat = 'png';

  @Transform(({ value }) =>
    typeof value === 'string' && DIGITS_ONLY_PATTERN.test(value)
      ? Number(value)
      : value,
  )
  @IsInt()
  @Min(BRAND_LOGO_DOWNLOAD_MIN_SIZE)
  @Max(BRAND_LOGO_DOWNLOAD_MAX_SIZE)
  @ApiProperty({
    default: BRAND_LOGO_DOWNLOAD_DEFAULT_SIZE,
    description: 'Longest side in pixels. Ignored for SVG.',
    maximum: BRAND_LOGO_DOWNLOAD_MAX_SIZE,
    minimum: BRAND_LOGO_DOWNLOAD_MIN_SIZE,
  })
  size: number = BRAND_LOGO_DOWNLOAD_DEFAULT_SIZE;
}
