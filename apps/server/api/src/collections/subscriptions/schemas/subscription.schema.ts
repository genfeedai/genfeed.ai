import type { Subscription } from '@genfeedai/prisma';

export type { Subscription } from '@genfeedai/prisma';

export interface SubscriptionDocument extends Subscription {
  _id: string;
  customer?: string;
  organization: string;
  stripeCustomerId?: string;
  type?: string;
  user: string;
  [key: string]: unknown;
}
