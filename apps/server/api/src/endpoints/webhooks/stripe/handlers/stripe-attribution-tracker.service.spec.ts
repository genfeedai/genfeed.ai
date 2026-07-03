import { UsersService } from '@api/collections/users/services/users.service';
import { StripeAttributionTrackerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-attribution-tracker.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { ISubscriptionOssReadModel } from '@genfeedai/interfaces/billing';
import { SUBSCRIPTION_ATTRIBUTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeAttributionTrackerService', () => {
  let tracker: StripeAttributionTrackerService;

  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const stripeService = { getSubscription: vi.fn() };
  const usersService = { findOne: vi.fn() };
  const subscriptionAttributionsService = { trackSubscription: vi.fn() };

  const subscription = {
    organization: 'org_1',
    stripePriceId: 'price_db',
    user: 'user_1',
  } as unknown as ISubscriptionOssReadModel;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeAttributionTrackerService,
        { provide: LoggerService, useValue: loggerService },
        { provide: StripeService, useValue: stripeService },
        { provide: UsersService, useValue: usersService },
        {
          provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
          useValue: subscriptionAttributionsService,
        },
      ],
    }).compile();

    tracker = module.get(StripeAttributionTrackerService);
  });

  it('records attribution with amount, plan, and UTM metadata from the session', async () => {
    stripeService.getSubscription.mockResolvedValue({
      customer: 'cus_123',
      items: {
        data: [
          {
            price: { currency: 'usd', id: 'price_1', unit_amount: 4900 },
          },
        ],
      },
    });
    usersService.findOne.mockResolvedValue({ email: 'ada@example.com' });

    await tracker.trackSubscriptionAttributionFromSession(
      {
        customer: 'cus_123',
        customer_details: { email: 'ada@example.com' },
        id: 'cs_1',
        metadata: {
          sourcePlatform: 'youtube',
          utm_campaign: 'launch',
          utm_source: 'newsletter',
        },
        subscription: 'sub_stripe_1',
      } as unknown as StripeCheckoutSession,
      subscription,
      'test',
    );

    expect(
      subscriptionAttributionsService.trackSubscription,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4900,
        currency: 'USD',
        email: 'ada@example.com',
        plan: 'price_1',
        sourcePlatform: 'youtube',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_1',
        userId: 'user_1',
        utm: { campaign: 'launch', source: 'newsletter' },
      }),
      'org_1',
    );
  });

  it('returns early when the session carries no subscription', async () => {
    await tracker.trackSubscriptionAttributionFromSession(
      {
        customer: 'cus_123',
        id: 'cs_1',
        metadata: {},
      } as unknown as StripeCheckoutSession,
      subscription,
      'test',
    );

    expect(stripeService.getSubscription).not.toHaveBeenCalled();
    expect(
      subscriptionAttributionsService.trackSubscription,
    ).not.toHaveBeenCalled();
  });

  it('logs and swallows tracking failures', async () => {
    stripeService.getSubscription.mockRejectedValue(new Error('boom'));

    await tracker.trackSubscriptionAttributionFromSession(
      {
        customer: 'cus_123',
        id: 'cs_1',
        metadata: {},
        subscription: 'sub_stripe_1',
      } as unknown as StripeCheckoutSession,
      subscription,
      'test',
    );

    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to record subscription attribution'),
      expect.any(Error),
    );
  });
});
