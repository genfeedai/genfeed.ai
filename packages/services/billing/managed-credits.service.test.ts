import { ManagedCreditsService } from '@services/billing/managed-credits.service';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ManagedCreditsService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('creates a public managed checkout session against the cloud API', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_GENFEED_MANAGED_CREDITS_API_ENDPOINT',
      'https://api.test/v1',
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            attributes: {
              url: 'https://checkout.stripe.test/session',
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await ManagedCreditsService.createCheckoutSession({
      email: 'buyer@example.com',
      quantity: 1000,
      successUrl:
        'http://localhost:3000/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
    });

    expect(result).toEqual({ url: 'https://checkout.stripe.test/session' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/services/stripe/managed/checkout',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('reads the managed checkout provisioning result by session ID', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_GENFEED_MANAGED_CREDITS_API_ENDPOINT',
      'https://api.test/v1',
    );
    const payload = {
      apiKey: 'gf_secret',
      apiKeyAlreadyExists: false,
      brandId: 'brand-1',
      email: 'buyer@example.com',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      ManagedCreditsService.getCheckoutResult('cs_test_123'),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/services/stripe/managed/sessions/cs_test_123',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
