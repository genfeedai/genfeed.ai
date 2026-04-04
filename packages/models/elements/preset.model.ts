import type { IPreset } from '@genfeedai/interfaces';
import { Preset as BasePreset } from '@genfeedai/client/models';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class Preset extends BasePreset {
  constructor(partial: Partial<IPreset>) {
    super(partial);

    if (
      partial?.organization &&
      typeof partial.organization === 'object' &&
      'id' in partial.organization
    ) {
      this.organization = new Organization(
        partial.organization as Organization,
      );
    }

    if (
      partial?.brand &&
      typeof partial.brand === 'object' &&
      'id' in partial.brand
    ) {
      this.brand = new Brand(partial.brand as Brand);
    }
  }
}
