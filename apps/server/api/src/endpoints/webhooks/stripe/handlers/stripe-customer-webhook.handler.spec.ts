import { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import type { StripeCustomer } from '@api/services/integrations/stripe/services/stripe.service';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeCustomerWebhookHandler', () => {
  let handler: StripeCustomerWebhookHandler;

  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionsService = {
    findByStripeCustomerId: vi.fn(),
    syncWithStripe: vi.fn(),
  };

  const customer = {
    email: 'ada@example.com',
    id: 'cus_123',
  } as unknown as StripeCustomer;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeCustomerWebhookHandler,
        { provide: LoggerService, useValue: loggerService },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptionsService },
      ],
    }).compile();

    handler = module.get(StripeCustomerWebhookHandler);
  });

  it('logs customer creation for auditing', () => {
    handler.handleCustomerCreated(customer, 'test');

    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('customer created in Stripe'),
      { customerId: 'cus_123', emailDomain: 'example.com' },
    );
  });

  it('syncs the subscription when the customer is known', async () => {
    const dbSubscription = { id: 'sub_db_1', organization: 'org_1' };
    subscriptionsService.findByStripeCustomerId.mockResolvedValue(
      dbSubscription,
    );

    await handler.handleCustomerUpdated(customer, 'test');

    expect(subscriptionsService.syncWithStripe).toHaveBeenCalledWith(
      dbSubscription,
    );
  });

  it('does nothing when no subscription matches the customer', async () => {
    subscriptionsService.findByStripeCustomerId.mockResolvedValue(null);

    await handler.handleCustomerUpdated(customer, 'test');

    expect(subscriptionsService.syncWithStripe).not.toHaveBeenCalled();
  });
});
