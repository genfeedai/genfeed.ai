import type { ISignupAttribution } from '@genfeedai/contracts/interfaces';
import {
  normalizeSignupAttributionValue,
  normalizeSignupLandingPath,
  normalizeSignupReferrerDomain,
} from '@helpers/onboarding/signup-attribution.helper';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

function normalizeWith(
  normalize: (value: string) => string | undefined,
): (params: { value: unknown }) => string | undefined {
  return ({ value }) =>
    typeof value === 'string' ? normalize(value) : undefined;
}

/**
 * First-touch acquisition source posted once after signup. Every field is
 * normalized with the same helper the clients use; a value that does not
 * survive normalization is dropped rather than rejected, so one bad UTM tag
 * never loses the rest of the attribution.
 */
export class RecordSignupAttributionDto implements ISignupAttribution {
  @ApiPropertyOptional({ description: 'External referring domain.' })
  @Transform(normalizeWith(normalizeSignupReferrerDomain))
  @IsOptional()
  @IsString()
  readonly referrerDomain?: string;

  @ApiPropertyOptional({ description: 'Marketing-site landing path.' })
  @Transform(normalizeWith(normalizeSignupLandingPath))
  @IsOptional()
  @IsString()
  readonly landingPath?: string;

  @ApiPropertyOptional()
  @Transform(normalizeWith(normalizeSignupAttributionValue))
  @IsOptional()
  @IsString()
  readonly utmSource?: string;

  @ApiPropertyOptional()
  @Transform(normalizeWith(normalizeSignupAttributionValue))
  @IsOptional()
  @IsString()
  readonly utmMedium?: string;

  @ApiPropertyOptional()
  @Transform(normalizeWith(normalizeSignupAttributionValue))
  @IsOptional()
  @IsString()
  readonly utmCampaign?: string;

  @ApiPropertyOptional()
  @Transform(normalizeWith(normalizeSignupAttributionValue))
  @IsOptional()
  @IsString()
  readonly utmContent?: string;
}
