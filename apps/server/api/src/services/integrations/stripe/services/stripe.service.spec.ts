vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_SELF_HOSTED: false,
  };
});

import { ConfigService } from '@api/config/config.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
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
        20,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [expect.objectContaining({ quantity: 20 })],
        }),
      );
    });
  });

  describe('PAYG metadata.credits includes bonus', () => {
    it('sets metadata.credits to base + bonus for Pro pack (99,900)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        99_900,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '109900',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('sets metadata.credits to base + bonus for Scale pack (499,900)', async () => {
      const createSpy = vi
        .spyOn(service.stripe.checkout.sessions, 'create')
        .mockResolvedValue({
          id: 'sess',
        } as unknown as Stripe.Checkout.Session);

      await service.createPaymentSession(
        'cust',
        'payg_id',
        'http://origin',
        499_900,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            credits: '599900',
            plan_type: 'payg',
          }),
        }),
      );
    });

    it('sets metadata.credits equal to quantity when no matching pack', async () => {
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
        249_900,
      );

      const callArg = createSpy.mock.calls[0][0];
      expect(callArg.allow_promotion_codes).toBe(true);
      expect(callArg).not.toHaveProperty('discounts');
    });
  });
});
