import { REFERRAL_CODE_MAX_LENGTH } from '@genfeedai/contracts/constants';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A new affiliate code. Format and reserved words are checked by the service
 * (one place, with a message per problem); here only the shape of the request.
 */
export class CreateReferralCodeDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(REFERRAL_CODE_MAX_LENGTH)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  brandId?: string;
}
