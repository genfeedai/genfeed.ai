import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { IsDateString, IsOptional } from 'class-validator';

export class AnalyticsPublicationScopeQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
