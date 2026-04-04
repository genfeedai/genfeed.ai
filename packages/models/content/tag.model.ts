import type { ITag } from '@genfeedai/interfaces';
import { Tag as BaseTag } from '@genfeedai/client/models';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class Tag extends BaseTag {
  constructor(partial: Partial<ITag>) {
    super(partial);

    if (
      partial?.user &&
      typeof partial.user === 'object' &&
      'id' in partial.user
    ) {
      this.user = new User(partial.user);
    }

    if (
      partial?.organization &&
      typeof partial.organization === 'object' &&
      'id' in partial.organization
    ) {
      this.organization = new Organization(partial.organization);
    }

    if (
      partial?.brand &&
      typeof partial.brand === 'object' &&
      'id' in partial.brand
    ) {
      this.brand = new Brand(partial.brand);
    }
  }
}
