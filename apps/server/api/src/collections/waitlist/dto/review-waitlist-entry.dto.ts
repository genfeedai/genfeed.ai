import { WaitlistStatus } from '@genfeedai/contracts';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewWaitlistEntryDto {
  @IsEnum(WaitlistStatus)
  status!: WaitlistStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
