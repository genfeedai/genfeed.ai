import {
  normalizeReferralCode,
  REFERRAL_CODE_MAX_LENGTH,
  REFERRAL_CODE_MIN_LENGTH,
  REFERRAL_CODE_PATTERN,
} from '@genfeedai/contracts/constants';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ClaimReferralDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeReferralCode(value) : value,
  )
  @IsString()
  @MinLength(REFERRAL_CODE_MIN_LENGTH)
  @MaxLength(REFERRAL_CODE_MAX_LENGTH)
  @Matches(REFERRAL_CODE_PATTERN)
  code!: string;
}
