import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ClaimReferralDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(32)
  @Matches(/^[23456789abcdefghjkmnpqrstuvwxyz]{8,32}$/)
  code!: string;
}
