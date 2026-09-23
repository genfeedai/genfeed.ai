import { extractInvoiceSubscriptionId } from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import type { SystemEvent } from '@api/services/system-events/system-event.types';
import type Stripe from 'stripe';

export function projectStripeSystemEvent(
  event: Stripe.Event,
): SystemEvent | null {
  if (!event.livemode) return null;
  const base = {
    version: 1 as const,
    id: event.id,
    occurredAt: new Date(event.created * 1000).toISOString(),
  };
  switch (event.type) {
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (!extractInvoiceSubscriptionId(invoice)) return null;
      return {
        ...base,
        type:
          event.type === 'invoice.paid'
            ? 'subscription.payment_succeeded'
            : 'payment.failed',
        data: {
          objectId: invoice.id,
          customerId:
            typeof invoice.customer === 'string'
              ? invoice.customer
              : invoice.customer?.id,
          amountMinor:
            event.type === 'invoice.paid'
              ? invoice.amount_paid
              : invoice.amount_due,
          currency: invoice.currency,
        },
      };
    }
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (
        session.mode !== 'payment' ||
        session.payment_status !== 'paid' ||
        session.metadata?.plan_type !== 'payg'
      )
        return null;
      return {
        ...base,
        type: 'credits.purchased',
        data: {
          objectId: session.id,
          customerId:
            typeof session.customer === 'string'
              ? session.customer
              : session.customer?.id,
          amountMinor: session.amount_total ?? 0,
          currency: session.currency ?? undefined,
          credits: Number(session.metadata.credits) || 0,
        },
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      return {
        ...base,
        type:
          event.type === 'customer.subscription.created'
            ? 'subscription.created'
            : event.type === 'customer.subscription.deleted'
              ? 'subscription.canceled'
              : 'subscription.updated',
        data: {
          objectId: subscription.id,
          customerId:
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      };
    }
    default:
      return null;
  }
}
