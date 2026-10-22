import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { PickType } from '@nestjs/swagger';

export class CampaignBrandScopeDto extends PickType(BaseQueryDto, [
  'brandId',
  'organizationId',
] as const) {
  static readonly [FORBID_NON_WHITELISTED] = true;
}
