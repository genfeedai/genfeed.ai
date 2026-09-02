import { ContentPlanStatus } from '@genfeedai/contracts';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateContentPlanDto {
  @IsString()
  @IsOptional()
  readonly name?: string;

  @IsString()
  @IsOptional()
  readonly description?: string;

  @IsEnum(ContentPlanStatus)
  @IsOptional()
  readonly status?: ContentPlanStatus;

  @IsDateString()
  @IsOptional()
  readonly periodStart?: string;

  @IsDateString()
  @IsOptional()
  readonly periodEnd?: string;
}
