import { ManualBrandKitDto } from '@api/collections/brands/dto/manual-brand-kit.dto';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { PickType } from '@nestjs/swagger';

export class UpdateBrandKitIdentityDto extends PickType(ManualBrandKitDto, [
  'description',
  'label',
] as const) {
  static readonly [FORBID_NON_WHITELISTED] = true;
}
