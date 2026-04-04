import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  SubscriptionCategory,
  SubscriptionStatus,
} from '@genfeedai/enums';
import type {
  IBrand,
  IOrganization,
  ISubscription,
  IUser,
} from '@genfeedai/interfaces';

export class Subscription extends BaseEntity implements ISubscription {
  public declare organization: IOrganization;
  public declare brand: IBrand;
  public declare user: IUser;
  public declare category: SubscriptionCategory;
  public declare stripeSubscriptionId: string;
  public declare stripeCustomerId: string;
  public declare stripePriceId: string;
  public declare status: SubscriptionStatus;
  public declare currentPeriodEnd?: string;

  constructor(data: Partial<ISubscription> = {}) {
    super(data);
  }
}
