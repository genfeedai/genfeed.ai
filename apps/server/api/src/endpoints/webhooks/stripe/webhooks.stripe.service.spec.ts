import type { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import type { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import type { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import type { StripePaymentWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-payment-webhook.handler';
import type { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Routed {
  args: unknown[];
  route: string;
}

describe('StripeWebhookService', () => {
  let routed: Routed[];
  let logs: string[];
  let service: StripeWebhookService;

  // Each handler method records which route it served and its arguments.
  function handler<T>(name: string, methods: string[]): T {
    return Object.fromEntries(
      methods.map((method) => [
        method,
        async (...args: unknown[]) => {
          routed.push({ args, route: `${name}.${method}` });
        },
      ]),
    ) as T;
  }

  function eventOf(type: string, object: Record<string, unknown> = {}) {
    return { data: { object }, type };
  }

  beforeEach(() => {
    routed = [];
    logs = [];

    service = new StripeWebhookService(
      {
        error: () => {},
        log: (message: string) => {
          logs.push(message);
        },
        warn: () => {},
      } as unknown as LoggerService,
      handler<StripeSubscriptionWebhookHandler>('subscription', [
        'handleSubscriptionCreated',
        'handleSubscriptionDeleted',
        'handleSubscriptionUpdated',
      ]),
      handler<StripeCheckoutWebhookHandler>('checkout', [
        'handleCheckoutCompleted',
      ]),
      handler<StripeInvoiceWebhookHandler>('invoice', [
        'handleInvoicePaid',
        'handleInvoicePaymentFailed',
      ]),
      handler<StripeCustomerWebhookHandler>('customer', [
        'handleCustomerCreated',
        'handleCustomerUpdated',
      ]),
      handler<StripePaymentWebhookHandler>('payment', [
        'handleChargeRefunded',
        'handleDisputeCreated',
      ]),
    );
  });

  it.each([
    ['customer.subscription.created', 'subscription.handleSubscriptionCreated'],
    ['customer.subscription.updated', 'subscription.handleSubscriptionUpdated'],
    ['customer.subscription.deleted', 'subscription.handleSubscriptionDeleted'],
    ['checkout.session.completed', 'checkout.handleCheckoutCompleted'],
    ['invoice.paid', 'invoice.handleInvoicePaid'],
    ['invoice.payment_failed', 'invoice.handleInvoicePaymentFailed'],
    ['customer.created', 'customer.handleCustomerCreated'],
    ['customer.updated', 'customer.handleCustomerUpdated'],
  ])('routes %s to %s with the request url', async (type, route) => {
    await service.handleWebhookEvent(eventOf(type, { id: 'obj_1' }), 'test');

    expect(routed).toEqual([{ args: [{ id: 'obj_1' }, 'test'], route }]);
  });

  it.each([
    ['charge.refunded', 'payment.handleChargeRefunded'],
    ['charge.dispute.created', 'payment.handleDisputeCreated'],
  ])('routes %s to %s', async (type, route) => {
    await service.handleWebhookEvent(eventOf(type, { id: 'obj_1' }), 'test');

    expect(routed).toEqual([{ args: [{ id: 'obj_1' }], route }]);
  });

  it('logs unhandled event types without touching any handler', async () => {
    await service.handleWebhookEvent(eventOf('charge.dispute.closed'), 'test');

    expect(routed).toEqual([]);
    expect(logs).toContainEqual(
      expect.stringContaining('unhandled event type: charge.dispute.closed'),
    );
  });
});
