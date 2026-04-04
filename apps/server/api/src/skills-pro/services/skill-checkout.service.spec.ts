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

    it('should throw BadRequestException when no price ID is available', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
          STRIPE_PRICE_SKILLS_PRO: '',
        }),
      );

      skillRegistryService.getBundleStripePriceId.mockResolvedValue(undefined);

      const dto: CreateSkillCheckoutDto = {};

      await expect(service.createCheckoutSession(dto)).rejects.toThrow(
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

    it('should use custom success and cancel URLs when provided in DTO', async () => {
      configService.get.mockImplementation(
        buildConfigGetMock({
          GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
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
        cancelUrl: 'https://custom.example.com/cancel',
        successUrl: 'https://custom.example.com/success',
      };

      await service.createCheckoutSession(dto);

      expect(
        stripeService.stripe.checkout.sessions.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          cancel_url: 'https://custom.example.com/cancel',
          success_url: 'https://custom.example.com/success',
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
