import type { SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import { BaseEntity } from '@api/entities/base.entity';

export class SubscriptionEntity
  extends BaseEntity
  implements SubscriptionDocument
{
  declare readonly id: string;
  declare readonly organizationId: string;
  declare readonly billingAccountId: string | null;
  declare readonly userId: string;
  declare readonly customerId: SubscriptionDocument['customerId'];

  declare readonly cancelAtPeriodEnd: SubscriptionDocument['cancelAtPeriodEnd'];

  declare readonly stripeSubscriptionId: SubscriptionDocument['stripeSubscriptionId'];
  declare readonly stripeCustomerId?: string;
  declare readonly stripePriceId: SubscriptionDocument['stripePriceId'];

  declare readonly status: SubscriptionDocument['status'];
  declare readonly plan: SubscriptionDocument['plan'];
  declare readonly currentPeriodStart: SubscriptionDocument['currentPeriodStart'];
  declare readonly currentPeriodEnd: SubscriptionDocument['currentPeriodEnd'];
  declare readonly isDeleted: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}
