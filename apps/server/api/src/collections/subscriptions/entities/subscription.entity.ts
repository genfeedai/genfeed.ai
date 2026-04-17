import type { Subscription } from '@api/collections/subscriptions/schemas/subscription.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';

export class SubscriptionEntity extends BaseEntity implements Subscription {
  declare readonly organization: string;
  declare readonly user: string;
  declare readonly customer: string;

  declare readonly cancelAtPeriodEnd: boolean;

  declare readonly stripeSubscriptionId?: string;
  declare readonly stripeCustomerId: string;
  declare readonly stripePriceId?: string;

  declare readonly status: SubscriptionStatus;
  declare readonly currentPeriodEnd?: Date;
  declare readonly type?: SubscriptionPlan;
}
