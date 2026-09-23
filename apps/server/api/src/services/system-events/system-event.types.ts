export type SystemEventType =
  | 'user.created'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'subscription.payment_succeeded'
  | 'payment.failed'
  | 'credits.purchased';

export interface SystemEvent {
  version: 1;
  id: string;
  type: SystemEventType;
  occurredAt: string;
  data: {
    objectId: string;
    email?: string;
    customerId?: string;
    amountMinor?: number;
    currency?: string;
    credits?: number;
    status?: string;
    cancelAtPeriodEnd?: boolean;
  };
}
