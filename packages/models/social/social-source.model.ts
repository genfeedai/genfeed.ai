import { SocialSource as BaseSocialSource } from '@genfeedai/client/models';
import type { ISocialSource } from '@genfeedai/interfaces';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class SocialSource extends BaseSocialSource {
  constructor(partial: Partial<ISocialSource> = {}) {
    super(partial);

    if (
      partial?.organization &&
      typeof partial.organization === 'object' &&
      'id' in partial.organization
    ) {
      this.organization = new Organization(
        partial.organization as unknown as Partial<Organization>,
      );
    }

    if (
      partial?.brand &&
      typeof partial.brand === 'object' &&
      'id' in partial.brand
    ) {
      this.brand = new Brand(partial.brand as unknown as Partial<Brand>);
    }

    if (
      partial?.user &&
      typeof partial.user === 'object' &&
      'id' in partial.user
    ) {
      this.user = new User(partial.user as unknown as Partial<User>);
    }
  }
}
