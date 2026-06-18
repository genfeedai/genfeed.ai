import { ConfigService } from '@api/config/config.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { CreateSkillCheckoutDto } from '@api/skills-pro/dto/create-skill-checkout.dto';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import type { IEnvConfig } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type Stripe from 'stripe';

describe('SkillCheckoutService', () => {
  let service: SkillCheckoutService;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;
  let skillRegistryService: vi.Mocked<SkillRegistryService>;
  let stripeService: {
    stripe: { checkout: { sessions: { create: ReturnType<typeof vi.fn> } } };
  };

  const buildConfigGetMock = (
    values: Partial<Record<keyof IEnvConfig, string>>,
  ) => vi.fn((key: keyof IEnvConfig) => values[key]);

  beforeEach(async () => {
    const mockStripeSessionCreate = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillCheckoutService,
        {
          provide: ConfigService,
          useValue: {
            get: buildConfigGetMock({
              GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
              STRIPE_PRICE_SKILLS_PRO: '',
              STRIPE_PROMOTION_CODE_SKILLS_PRO: '',
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: SkillRegistryService,
          useValue: {
            getBundlePriceCents: vi.fn(),
            getBundleStripePriceId: vi.fn(),
            getRegistry: vi.fn(),
            getSkillBySlug: vi.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            stripe: {
              checkout: {
                sessions: {
                  create: mockStripeSessionCreate,
                },
              },
            },
          },
        },
      ],
    }).compile();

    service = module.get<SkillCheckoutService>(SkillCheckoutService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
    skillRegistryService = module.get(SkillRegistryService);
    stripeService = module.get(StripeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session with env price ID', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/session/cs_test_123',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const dto: CreateSkillCheckoutDto = {
        email: 'buyer@example.com',
      };

      const result = await service.createCheckoutSession(dto);

      expect(result).toEqual({
        url: 'https://checkout.stripe.com/session/cs_test_123',
      });
      expect(
        stripeService.stripe.checkout.sessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          allow_promotion_codes: true,
          customer_email: 'buyer@example.com',
          line_items: [{ price: 'price_env_123', quantity: 1 }],
          metadata: { bundle: 'true', type: 'skills-pro' },
          mode: 'payment',
          payment_method_types: ['card'],
        }),
      );
    });

    it('should fall back to registry price ID when env is not set', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: '',
        }),
      );

      skillRegistryService.getBundleStripePriceId.mockResolvedValue(
        'price_registry_456',
      );

      const mockSession = {
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/session/cs_test_456',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const dto: CreateSkillCheckoutDto = {};

      const result = await service.createCheckoutSession(dto);

      expect(result.url).toBe(
        'https://checkout.stripe.com/session/cs_test_456',
      );
      expect(skillRegistryService.getBundleStripePriceId).toHaveBeenCalled();
      expect(
        stripeService.stripe.checkout.sessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_registry_456', quantity: 1 }],
        }),
      );
    });

    it('should fall back to registry bundle price when no price ID is available', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: '',
        }),
      );

      skillRegistryService.getBundleStripePriceId.mockResolvedValue(undefined);
      skillRegistryService.getBundlePriceCents.mockResolvedValue(2900);

      const dto: CreateSkillCheckoutDto = {};

      const mockSession = {
        id: 'cs_test_price_data',
        url: 'https://checkout.stripe.com/session/cs_test_price_data',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const result = await service.createCheckoutSession(dto);

      expect(result.url).toBe(
        'https://checkout.stripe.com/session/cs_test_price_data',
      );
      expect(skillRegistryService.getBundlePriceCents).toHaveBeenCalled();
      expect(
        stripeService.stripe.checkout.sessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Skills Pro Bundle',
                },
                unit_amount: 2900,
              },
              quantity: 1,
            },
          ],
        }),
      );
    });

    it('should throw BadRequestException when no price ID or bundle price is available', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: '',
        }),
      );

      skillRegistryService.getBundleStripePriceId.mockResolvedValue(undefined);
      skillRegistryService.getBundlePriceCents.mockResolvedValue(undefined);

      await expect(service.createCheckoutSession({})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use default success and cancel URLs when not provided in DTO', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      const mockSession = {
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/session/cs_test_789',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const dto: CreateSkillCheckoutDto = {};

      await service.createCheckoutSession(dto);

      expect(
        stripeService.stripe.checkout.sessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          cancel_url: 'https://app.genfeed.ai/skills-pro',
          success_url:
            'https://app.genfeed.ai/skills-pro/success?session_id={CHECKOUT_SESSION_ID}',
        }),
      );
    });

    it('should use custom success and cancel URLs from configured origins', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          GENFEEDAI_PUBLIC_URL: 'https://genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      const mockSession = {
        id: 'cs_test_custom',
        url: 'https://checkout.stripe.com/session/cs_test_custom',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const dto: CreateSkillCheckoutDto = {
        cancelUrl: 'https://genfeed.ai/skills',
        successUrl:
          'https://genfeed.ai/skills/success?session_id={CHECKOUT_SESSION_ID}',
      };

      await service.createCheckoutSession(dto);

      expect(
        stripeService.stripe.checkout.sessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          cancel_url: 'https://genfeed.ai/skills',
          success_url:
            'https://genfeed.ai/skills/success?session_id={CHECKOUT_SESSION_ID}',
        }),
      );
    });

    it('should ignore checkout redirect URLs from unknown origins', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          GENFEEDAI_PUBLIC_URL: 'https://genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      const mockSession = {
        id: 'cs_test_rejected_redirect',
        url: 'https://checkout.stripe.com/session/cs_test_rejected_redirect',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const dto: CreateSkillCheckoutDto = {
        cancelUrl: 'https://evil.example/cancel',
        successUrl: 'https://evil.example/success',
      };

      await service.createCheckoutSession(dto);

      expect(
        stripeService.stripe.checkout.sessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          cancel_url: 'https://app.genfeed.ai/skills-pro',
          success_url:
            'https://app.genfeed.ai/skills-pro/success?session_id={CHECKOUT_SESSION_ID}',
        }),
      );
    });

    it('should not set customer_email when email is not provided', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      const mockSession = {
        id: 'cs_test_no_email',
        url: 'https://checkout.stripe.com/session/cs_test_no_email',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const dto: CreateSkillCheckoutDto = {};

      await service.createCheckoutSession(dto);

      const callArgs = stripeService.stripe.checkout.sessions.create.mock
        .calls[0][0] as Stripe.Checkout.SessionCreateParams;
      expect(callArgs.customer_email).toBeUndefined();
    });

    it('should apply the configured promotion code discount automatically', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
          STRIPE_PROMOTION_CODE_SKILLS_PRO: 'promo_earlygen',
        }),
      );

      const mockSession = {
        id: 'cs_test_discount',
        url: 'https://checkout.stripe.com/session/cs_test_discount',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      await service.createCheckoutSession({});

      const callArgs = stripeService.stripe.checkout.sessions.create.mock
        .calls[0][0] as Stripe.Checkout.SessionCreateParams;
      expect(callArgs.allow_promotion_codes).toBeUndefined();
      expect(callArgs.discounts).toEqual([
        { promotion_code: 'promo_earlygen' },
      ]);
    });

    it('should return empty string url when Stripe session has no url', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      const mockSession = {
        id: 'cs_test_no_url',
        url: null,
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      const dto: CreateSkillCheckoutDto = {};

      const result = await service.createCheckoutSession(dto);

      expect(result.url).toBe('');
    });

    it('should propagate Stripe API errors', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      stripeService.stripe.checkout.sessions.create.mockRejectedValue(
        new Error('Stripe rate limit exceeded'),
      );

      const dto: CreateSkillCheckoutDto = { email: 'user@example.com' };

      await expect(service.createCheckoutSession(dto)).rejects.toThrow(
        'Stripe rate limit exceeded',
      );
    });

    it('should log checkout session creation', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: 'price_env_123',
        }),
      );

      const mockSession = {
        id: 'cs_test_log',
        url: 'https://checkout.stripe.com/session/cs_test_log',
      } as unknown as Stripe.Checkout.Session;

      stripeService.stripe.checkout.sessions.create.mockResolvedValue(
        mockSession,
      );

      await service.createCheckoutSession({});

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('createCheckoutSession'),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('checkout session created'),
        expect.objectContaining({ sessionId: 'cs_test_log' }),
      );
    });
  });
});
