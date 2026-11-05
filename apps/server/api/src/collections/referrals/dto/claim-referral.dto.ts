import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

const REFERRAL_CODE_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{8,32}$/;

export class ClaimReferralDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(32)
  @Matches(REFERRAL_CODE_PATTERN)
  code!: string;
}
