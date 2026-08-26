import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { SubscriptionPlan, SubscriptionTier } from '@genfeedai/enums';
import { TIER_INCLUDED_MONTHLY_CREDITS } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRO_MONTHLY_PRICE_ID = 'price_pro_monthly';
const SCALE_MONTHLY_PRICE_ID = 'price_scale_monthly';

describe('SubscriptionCreditGrantService', () => {
  let service: SubscriptionCreditGrantService;

  const configService = { get: vi.fn() };
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const stripeService = { getPrice: vi.fn() };

  const configuredPrices: Record<string, string> = {
    STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: PRO_MONTHLY_PRICE_ID,
    STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: SCALE_MONTHLY_PRICE_ID,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockImplementation(
      (key: string) => configuredPrices[key] ?? '',
    );
    stripeService.getPrice.mockResolvedValue({ metadata: {} });

    service = new SubscriptionCreditGrantService(
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
      stripeService as unknown as StripeService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('resolveMonthlyCredits', () => {
    it('reads the grant from the Stripe price metadata', async () => {
      stripeService.getPrice.mockResolvedValue({
        metadata: { included_monthly_credits: '7500' },
      });

      await expect(
        service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID),
      ).resolves.toBe(7_500);
    });

    it('prefers the price metadata over the published tier table', async () => {
      stripeService.getPrice.mockResolvedValue({
        metadata: { included_monthly_credits: '12000' },
      });

      const credits = await service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID);

      expect(credits).toBe(12_000);
      expect(credits).not.toBe(TIER_INCLUDED_MONTHLY_CREDITS.pro);
    });

    it('falls back to the tier table when the price carries no metadata', async () => {
      await expect(
        service.resolveMonthlyCredits(SCALE_MONTHLY_PRICE_ID),
      ).resolves.toBe(TIER_INCLUDED_MONTHLY_CREDITS.scale);
    });

    it.each([
      ['not a number', 'nope'],
      ['a negative amount', '-500'],
      ['zero', '0'],
      ['a fractional amount', '1500.5'],
      ['an empty string', ''],
    ])(
      'ignores %s in the metadata and warns the operator',
      async (_label: string, value: string) => {
        stripeService.getPrice.mockResolvedValue({
          metadata: { included_monthly_credits: value },
        });

        await expect(
          service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID),
        ).resolves.toBe(TIER_INCLUDED_MONTHLY_CREDITS.pro);
        expect(loggerService.warn).toHaveBeenCalledWith(
          expect.stringContaining('unusable credit metadata'),
          expect.objectContaining({ stripePriceId: PRO_MONTHLY_PRICE_ID }),
        );
      },
    );

    it('falls back to the tier table when Stripe is unreachable', async () => {
      stripeService.getPrice.mockRejectedValue(new Error('stripe down'));

      await expect(
        service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID),
      ).resolves.toBe(TIER_INCLUDED_MONTHLY_CREDITS.pro);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('resolves null for a price that neither source knows', async () => {
      await expect(
        service.resolveMonthlyCredits('price_unmapped'),
      ).resolves.toBeNull();
    });

    it('resolves null without calling Stripe when there is no price at all', async () => {
      await expect(service.resolveMonthlyCredits(null)).resolves.toBeNull();
      expect(stripeService.getPrice).not.toHaveBeenCalled();
    });

    it('caches a resolved price so a burst costs one Stripe round trip', async () => {
      await service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID);
      await service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID);

      expect(stripeService.getPrice).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent cache misses into one Stripe round trip', async () => {
      let releasePrice: (() => void) | undefined;
      stripeService.getPrice.mockImplementation(
        async () =>
          await new Promise<{ metadata: Record<string, string> }>((resolve) => {
            releasePrice = () =>
              resolve({ metadata: { included_monthly_credits: '5900' } });
          }),
      );

      const first = service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID);
      const second = service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID);
      releasePrice?.();

      await expect(Promise.all([first, second])).resolves.toEqual([
        5_900, 5_900,
      ]);
      expect(stripeService.getPrice).toHaveBeenCalledTimes(1);
    });

    it('coalesces a failed Stripe lookup before applying the tier fallback', async () => {
      stripeService.getPrice.mockRejectedValue(new Error('stripe unavailable'));

      await expect(
        Promise.all([
          service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID),
          service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID),
        ]),
      ).resolves.toEqual([
        TIER_INCLUDED_MONTHLY_CREDITS.pro,
        TIER_INCLUDED_MONTHLY_CREDITS.pro,
      ]);
      expect(stripeService.getPrice).toHaveBeenCalledTimes(1);
    });

    it('re-reads the price once the cache entry expires', async () => {
      vi.useFakeTimers();

      await service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await service.resolveMonthlyCredits(PRO_MONTHLY_PRICE_ID);

      expect(stripeService.getPrice).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolvePlanCredits', () => {
    beforeEach(() => {
      stripeService.getPrice.mockResolvedValue({
        metadata: { included_monthly_credits: '5900' },
      });
    });

    it('grants one month for a monthly plan', async () => {
      await expect(
        service.resolvePlanCredits(
          SubscriptionPlan.MONTHLY,
          PRO_MONTHLY_PRICE_ID,
        ),
      ).resolves.toBe(5_900);
    });

    it('grants twelve months up front for a yearly plan', async () => {
      await expect(
        service.resolvePlanCredits(
          SubscriptionPlan.YEARLY,
          PRO_MONTHLY_PRICE_ID,
        ),
      ).resolves.toBe(5_900 * 12);
    });

    it('resolves null for a plan that carries no recurring allowance', async () => {
      await expect(
        service.resolvePlanCredits(SubscriptionPlan.PAYG, PRO_MONTHLY_PRICE_ID),
      ).resolves.toBeNull();
    });

    it('resolves null when the price itself is unresolvable', async () => {
      stripeService.getPrice.mockResolvedValue({ metadata: {} });

      await expect(
        service.resolvePlanCredits(SubscriptionPlan.MONTHLY, 'price_unmapped'),
      ).resolves.toBeNull();
    });
  });

  describe('resolveTierFromPriceId', () => {
    it('maps a configured price id to its tier', () => {
      expect(service.resolveTierFromPriceId(PRO_MONTHLY_PRICE_ID)).toBe(
        SubscriptionTier.PRO,
      );
      expect(service.resolveTierFromPriceId(SCALE_MONTHLY_PRICE_ID)).toBe(
        SubscriptionTier.SCALE,
      );
    });

    it('resolves null for an unmapped or missing price id', () => {
      expect(service.resolveTierFromPriceId('price_unmapped')).toBeNull();
      expect(service.resolveTierFromPriceId(null)).toBeNull();
    });

    it('resolves null when no price env is configured at all', () => {
      configService.get.mockReturnValue('');

      expect(service.resolveTierFromPriceId(PRO_MONTHLY_PRICE_ID)).toBeNull();
    });
  });

  describe('logUnresolvedGrant', () => {
    it('warns with the price and the two ways to fix it', () => {
      service.logUnresolvedGrant('test', {
        organizationId: 'org_1',
        stripePriceId: 'price_unmapped',
      });

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('credit grant unresolved'),
        expect.objectContaining({
          metadataKey: 'included_monthly_credits',
          organizationId: 'org_1',
          outcome: 'missing_price_credit_metadata',
          stripePriceId: 'price_unmapped',
        }),
      );
    });
  });
});
