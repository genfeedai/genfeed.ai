import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const DIGITS_ONLY_PATTERN = /^[0-9]+$/;

export class BrandFontAssetsQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @Transform(({ value }) =>
    typeof value === 'string' && DIGITS_ONLY_PATTERN.test(value)
      ? Number(value)
      : value,
  )
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2112)
  cursor?: string;
}
