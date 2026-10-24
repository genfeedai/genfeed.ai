import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { TrialCardSetupService } from '@api/services/integrations/stripe/services/trial-card-setup.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type Stripe from 'stripe';

function stripeResponse<T extends object>(resource: T): Stripe.Response<T> {
  return {
    ...resource,
    lastResponse: { headers: {}, requestId: 'req_test', statusCode: 200 },
  };
}

describe('TrialCardSetupService', () => {
  const sessions = { create: vi.fn(), retrieve: vi.fn() };
  const stripeService = {
    stripe: { checkout: { sessions } },
  } as unknown as StripeService;
  const logger = { error: vi.fn(), log: vi.fn() };
  const service = new TrialCardSetupService(
    stripeService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });
  const customerId = 'cus_trial';

  function setupSession(
    overrides: Partial<Stripe.Checkout.Session> = {},
    fingerprint: string | null = 'fp_card',
  ): Stripe.Response<Stripe.Checkout.Session> {
    return stripeResponse({
      customer: customerId,
      id: 'cs_setup',
      metadata: { purpose: 'trial-card' },
      mode: 'setup',
      object: 'checkout.session',
      setup_intent: {
        object: 'setup_intent',
        payment_method: { card: { fingerprint }, id: 'pm_1' },
        status: 'succeeded',
      },
      status: 'complete',
      ...overrides,
    } as unknown as Stripe.Checkout.Session);
  }

  it('creates a card-only setup session that charges nothing', async () => {
    const createSpy = sessions.create.mockResolvedValue(
      stripeResponse({ id: 'cs_setup', object: 'checkout.session' }),
    );

    await service.createTrialCardSetupSession({
      cancelUrl: 'https://app/cancel',
      organizationId: 'org-1',
      stripeCustomerId: customerId,
      successUrl: 'https://app/success',
    });

    expect(createSpy).toHaveBeenCalledWith({
      allowed_payment_method_types: ['card'],
      cancel_url: 'https://app/cancel',
      customer: customerId,
      metadata: { organizationId: 'org-1', purpose: 'trial-card' },
      mode: 'setup',
      success_url: 'https://app/success',
    });
  });

  it('returns the fingerprint of a completed setup for the same customer', async () => {
    const retrieveSpy = sessions.retrieve.mockResolvedValue(setupSession());

    await expect(
      service.getTrialCardFingerprint('cs_setup', customerId),
    ).resolves.toBe('fp_card');
    expect(retrieveSpy).toHaveBeenCalledWith('cs_setup', {
      expand: ['setup_intent.payment_method'],
    });
  });

  it.each([
    ['another customer', { customer: 'cus_other' }],
    ['an unfinished session', { status: 'open' as const }],
    ['a session not made for the trial card', { metadata: {} }],
    ['a payment-mode session', { mode: 'payment' as const }],
    [
      'a setup intent that did not succeed',
      {
        setup_intent: {
          object: 'setup_intent',
          payment_method: { card: { fingerprint: 'fp_card' }, id: 'pm_1' },
          status: 'requires_action',
        },
      },
    ],
  ])('refuses %s', async (_label, overrides) => {
    sessions.retrieve.mockResolvedValue(
      setupSession(overrides as Partial<Stripe.Checkout.Session>),
    );

    await expect(
      service.getTrialCardFingerprint('cs_setup', customerId),
    ).resolves.toBeNull();
  });

  it('returns null for a saved method that is not a card', async () => {
    sessions.retrieve.mockResolvedValue(
      setupSession({
        setup_intent: {
          object: 'setup_intent',
          payment_method: { id: 'pm_1', us_bank_account: {} },
          status: 'succeeded',
        },
      } as unknown as Partial<Stripe.Checkout.Session>),
    );

    await expect(
      service.getTrialCardFingerprint('cs_setup', customerId),
    ).resolves.toBeNull();
  });
});
