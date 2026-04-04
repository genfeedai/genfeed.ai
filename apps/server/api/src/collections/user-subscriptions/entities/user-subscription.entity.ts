import { UserSubscription } from '@api/collections/user-subscriptions/schemas/user-subscription.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class UserSubscriptionEntity
  extends BaseEntity
  implements UserSubscription
{
  declare readonly user: Types.ObjectId;
  declare readonly stripeCustomerId: string;
  declare readonly stripeSubscriptionId?: string;
  declare readonly stripePriceId?: string;
  declare readonly currentPeriodEnd?: Date;
  declare readonly cancelAtPeriodEnd: boolean;
  declare readonly type?: SubscriptionPlan;
  declare readonly status: SubscriptionStatus;
}
