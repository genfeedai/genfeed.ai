import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;

  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionHandler = {
    handleSubscriptionCreated: vi.fn(),
    handleSubscriptionDeleted: vi.fn(),
    handleSubscriptionUpdated: vi.fn(),
  };
  const checkoutHandler = { handleCheckoutCompleted: vi.fn() };
  const invoiceHandler = {
    handleInvoicePaid: vi.fn(),
    handleInvoicePaymentFailed: vi.fn(),
  };
  const customerHandler = {
    handleCustomerCreated: vi.fn(),
    handleCustomerUpdated: vi.fn(),
  };

  function eventOf(type: string, object: Record<string, unknown> = {}) {
    return { data: { object }, type };
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        { provide: LoggerService, useValue: loggerService },
        {
          provide: StripeSubscriptionWebhookHandler,
          useValue: subscriptionHandler,
        },
        { provide: StripeCheckoutWebhookHandler, useValue: checkoutHandler },
        { provide: StripeInvoiceWebhookHandler, useValue: invoiceHandler },
        { provide: StripeCustomerWebhookHandler, useValue: customerHandler },
      ],
    }).compile();

    service = module.get(StripeWebhookService);
  });

  it.each([
    [
      'customer.subscription.created',
      subscriptionHandler,
      'handleSubscriptionCreated',
    ],
    [
      'customer.subscription.updated',
      subscriptionHandler,
      'handleSubscriptionUpdated',
    ],
    [
      'customer.subscription.deleted',
      subscriptionHandler,
      'handleSubscriptionDeleted',
    ],
    ['checkout.session.completed', checkoutHandler, 'handleCheckoutCompleted'],
    ['invoice.paid', invoiceHandler, 'handleInvoicePaid'],
    ['invoice.payment_failed', invoiceHandler, 'handleInvoicePaymentFailed'],
    ['customer.created', customerHandler, 'handleCustomerCreated'],
    ['customer.updated', customerHandler, 'handleCustomerUpdated'],
  ] as const)('routes %s to its handler', async (type, handler, method) => {
    const object = { id: 'obj_1' };

    await service.handleWebhookEvent(eventOf(type, object), 'test');

    expect(handler[method]).toHaveBeenCalledWith(object, 'test');
  });

  it('logs unhandled event types without touching any handler', async () => {
    await service.handleWebhookEvent(eventOf('charge.refunded'), 'test');

    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('unhandled event type: charge.refunded'),
    );
    expect(checkoutHandler.handleCheckoutCompleted).not.toHaveBeenCalled();
    expect(invoiceHandler.handleInvoicePaid).not.toHaveBeenCalled();
    expect(
      subscriptionHandler.handleSubscriptionCreated,
    ).not.toHaveBeenCalled();
    expect(customerHandler.handleCustomerCreated).not.toHaveBeenCalled();
  });
});
