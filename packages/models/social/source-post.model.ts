import { SourcePost as BaseSourcePost } from '@genfeedai/client/models';
import type { ISourcePost } from '@genfeedai/interfaces';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';
import { SocialSource } from './social-source.model';

export class SourcePost extends BaseSourcePost {
  constructor(partial: Partial<ISourcePost> = {}) {
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

    if (
      partial?.source &&
      typeof partial.source === 'object' &&
      'id' in partial.source
    ) {
      this.source = new SocialSource(
        partial.source as unknown as Partial<SocialSource>,
      );
    }
  }
}
