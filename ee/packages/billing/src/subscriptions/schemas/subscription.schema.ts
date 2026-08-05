import type { Subscription } from '@genfeedai/prisma';

export type { Subscription } from '@genfeedai/prisma';

export interface SubscriptionDocument extends Subscription {
  stripeCustomerId?: string;
}
