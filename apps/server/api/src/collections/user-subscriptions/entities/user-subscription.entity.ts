import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { SubscriptionPlan } from '@genfeedai/enums';
import { type UserSubscription } from '@genfeedai/prisma';

export class UserSubscriptionEntity
  extends BaseEntity
  implements UserSubscription
{
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly userId: string;
  declare readonly user: string;
  declare readonly stripeSubscriptionId: string | null;
  declare readonly stripePriceId: string | null;
  declare readonly plan: UserSubscription['plan'];
  declare readonly currentPeriodStart: UserSubscription['currentPeriodStart'];
  declare readonly currentPeriodEnd: Date | null;
  declare readonly cancelAtPeriodEnd: boolean;
  declare readonly status: UserSubscription['status'];
}
