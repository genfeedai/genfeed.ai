import { IsString, Matches, MaxLength } from 'class-validator';

export class ClaimReferralDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]{8,32}$/)
  code!: string;
}
