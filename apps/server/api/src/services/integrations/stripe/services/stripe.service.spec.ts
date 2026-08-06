vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => false,
  };
});

import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    const configGetMock = vi.fn((key: string) => {
      const map: Record<string, string> = {
        GENFEEDAI_APP_URL: 'http://localhost:3000',
        STRIPE_API_VERSION: '2026-01-28.clover',
        STRIPE_PRICE_PAYG: 'payg_id',
        STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
        STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
        STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
        STRIPE_SECRET_KEY: 'sk_test',
      };
      return map[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: ConfigService, useValue: { get: configGetMock } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPaymentSession', () => {
    it('should pass quantity to stripe checkout', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        2_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [expect.objectContaining({ quantity: 2_000 })],
        }),
      );
    });
  });

  describe('PAYG metadata.credits (flat top-up, no bonus)', () => {
    it('sets metadata.credits to the preset amount for the $1,000 pack (100,000)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        100_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '100000',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('sets metadata.credits to the preset amount for the $50 pack (5,000)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        5_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '5000',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('sets metadata.credits equal to quantity for a custom (non-preset) amount', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        12_345,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '12345',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('does not apply discounts/coupons, uses allow_promotion_codes', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        250_000,
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });
  });

  describe('PAYG min/max enforcement', () => {
    // 1 credit = $0.01 → min $10 = 1,000 credits, max $10,000 = 1,000,000 credits
    it('rejects a below-minimum quantity (999 credits) without calling Stripe', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await expect(
        service.createPaymentSession('cust', 'payg_id', 'http://origin', 999),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('accepts the minimum quantity (1,000 credits = $10)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        1_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [expect.objectContaining({ quantity: 1_000 })],
        }),
      );
    });

    it('accepts the maximum quantity (1,000,000 credits = $10,000)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        1_000_000,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [expect.objectContaining({ quantity: 1_000_000 })],
        }),
      );
    });

    it('rejects an above-maximum quantity (1,000,001 credits) without calling Stripe', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await expect(
        service.createPaymentSession(
          'cust',
          'payg_id',
          'http://origin',
          1_000_001,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('enforces the same bounds on the managed PAYG checkout (below min)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess_managed',
        } as unknown as Stripe.Checkout.Session);

      await expect(
        service.createManagedPaymentSession({
          email: 'managed@example.com',
          quantity: 999,
          stripePriceId: 'payg_id',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('enforces the same bounds on the managed PAYG checkout (above max)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess_managed',
        } as unknown as Stripe.Checkout.Session);

      await expect(
        service.createManagedPaymentSession({
          email: 'managed@example.com',
          quantity: 1_000_001,
          stripePriceId: 'payg_id',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('launch promotion code on Creator/Pro subscription checkout', () => {
    it('uses allow_promotion_codes when STRIPE_PROMOTION_CODE_LAUNCH is unset', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession('cust', 'pro_id', 'http://origin');

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });

    it('applies discounts with the configured promotion code when set for the Pro price', async () => {
      const configGetMock = vi.fn((key: string) => {
        const map: Record<string, string> = {
          GENFEEDAI_APP_URL: 'http://localhost:3000',
          STRIPE_API_VERSION: '2026-01-28.clover',
          STRIPE_PRICE_PAYG: 'payg_id',
          STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
          STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
          STRIPE_PROMOTION_CODE_LAUNCH: 'promo_launch123',
          STRIPE_SECRET_KEY: 'sk_test',
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      const scopedService = module.get<StripeService>(StripeService);

      const createSpy = vi
        .spyOn(scopedService.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await scopedService.createPaymentSession(
        'cust',
        'pro_id',
        'http://origin',
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.discounts).toEqual([
        { promotion_code: 'promo_launch123' },
      ]);
      expect(callArg).not.toHaveProperty('allow_promotion_codes');
    });

    it('does not apply the launch promotion code to other subscription tiers', async () => {
      const configGetMock = vi.fn((key: string) => {
        const map: Record<string, string> = {
          GENFEEDAI_APP_URL: 'http://localhost:3000',
          STRIPE_API_VERSION: '2026-01-28.clover',
          STRIPE_PRICE_PAYG: 'payg_id',
          STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
          STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
          STRIPE_PROMOTION_CODE_LAUNCH: 'promo_launch123',
          STRIPE_SECRET_KEY: 'sk_test',
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      const scopedService = module.get<StripeService>(StripeService);

      const createSpy = vi
        .spyOn(scopedService.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await scopedService.createPaymentSession(
        'cust',
        'enterprise_id',
        'http://origin',
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });

    it('treats the yearly Pro price as a subscription without auto-applying the monthly launch coupon', async () => {
      const configGetMock = vi.fn((key: string) => {
        const map: Record<string, string> = {
          GENFEEDAI_APP_URL: 'http://localhost:3000',
          STRIPE_API_VERSION: '2026-01-28.clover',
          STRIPE_PRICE_PAYG: 'payg_id',
          STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'enterprise_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'pro_id',
          STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY: 'pro_yearly_id',
          STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'scale_id',
          STRIPE_PROMOTION_CODE_LAUNCH: 'promo_launch123',
          STRIPE_SECRET_KEY: 'sk_test',
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StripeService,
          { provide: ConfigService, useValue: { get: configGetMock } },
          {
            provide: LoggerService,
            useValue: { error: vi.fn(), log: vi.fn() },
          },
        ],
      }).compile();

      const scopedService = module.get<StripeService>(StripeService);

      const createSpy = vi
        .spyOn(scopedService.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await scopedService.createPaymentSession(
        'cust',
        'pro_yearly_id',
        'http://origin',
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.mode).toBe('subscription');
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });
  });

  describe('createManagedPaymentSession', () => {
    it('creates a public managed checkout with customer_email and managed metadata', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess_managed',
          url: 'https://checkout.stripe.com/pay/managed',
        } as unknown as Stripe.Checkout.Session);

      await service.createManagedPaymentSession({
        email: 'managed@example.com',
        firstName: 'Vincent',
        quantity: 100_000,
        stripePriceId: 'payg_id',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_creation: 'always',
          customer_email: 'managed@example.com',
          line_items: [expect.objectContaining({ quantity: 100_000 })],
          metadata: expect.objectContaining({
            credits: '100000',
            email: 'managed@example.com',
            firstName: 'Vincent',
            plan_type: 'payg',
            type: 'managed_inference',
          }),
          mode: 'payment',
        }),
      );
    });
  });
});
