import { Subscription as BaseSubscription } from '@genfeedai/client/models';
import type { ISubscriptionPreview } from '@genfeedai/interfaces';
import { User } from '@models/auth/user.model';
import { Brand } from '@models/organization/brand.model';
import { Organization } from '@models/organization/organization.model';

export class SubscriptionPreview implements ISubscriptionPreview {
  public price: string;

  constructor(partial: Partial<SubscriptionPreview> = {}) {
    this.price = partial.price ?? '';
  }
}

function isObjectWithId(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && 'id' in value;
}

export class Subscription extends BaseSubscription {
  constructor(partial: Partial<BaseSubscription>) {
    super(partial);

    if (isObjectWithId(partial?.organization)) {
      this.organization = new Organization(partial.organization);
    }

    if (isObjectWithId(partial?.brand)) {
      this.brand = new Brand(partial.brand);
    }

    if (isObjectWithId(partial?.user)) {
      this.user = new User(partial.user);
    }
  }
}
