import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  SubscriptionCategory,
  SubscriptionStatus,
} from '@genfeedai/contracts';
import type {
  IBrand,
  IOrganization,
  ISubscription,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Subscription extends BaseEntity implements ISubscription {
  declare public organization: IOrganization;
  declare public brand: IBrand;
  declare public user: IUser;
  declare public category: SubscriptionCategory;
  declare public stripeSubscriptionId: string;
  declare public stripeCustomerId: string;
  declare public stripePriceId: string;
  declare public status: SubscriptionStatus;
  declare public currentPeriodEnd?: string;

  constructor(data: Partial<ISubscription> = {}) {
    super(data);
  }
}
