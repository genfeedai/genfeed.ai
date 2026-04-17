import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { SkillReceipt } from '@api/skills-pro/schemas/skill-receipt.schema';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let apiKeysService: vi.Mocked<ApiKeysService>;
  let brandsService: vi.Mocked<BrandsService>;
  let clerkService: vi.Mocked<ClerkService>;
  let creditsUtilsService: vi.Mocked<CreditsUtilsService>;
  let managedStripeCheckoutService: vi.Mocked<ManagedStripeCheckoutService>;
  let organizationsService: vi.Mocked<OrganizationsService>;
  let subscriptionsService: vi.Mocked<SubscriptionsService>;
  let subscriptionAttributionsService: vi.Mocked<SubscriptionAttributionsService>;
  let stripeService: vi.Mocked<StripeService>;
  let usersService: vi.Mocked<UsersService>;
  let loggerService: { error: vi.Mock; log: vi.Mock; warn: vi.Mock };

  const organizationId = '507f191e810c19729de860ee';
  const userId = '507f191e810c19729de860ee';
  const contentId = '507f191e810c19729de860ee'.toString();

  const mockSubscription = {
    cancel_at_period_end: false,
    customer: 'cus_123',
    id: 'sub_123',
    items: {
      data: [
        {
          price: {
            currency: 'usd',
            id: 'price_123',
            unit_amount: 9900,
          },
        },
      ],
    },
    status: 'active',
  } as unknown as Stripe.Subscription;

  const mockCheckoutSession = {
    customer: 'cus_123',
    customer_details: {
      email: 'customer@example.com',
    },
    id: 'cs_123',
    metadata: {
      sourceContentId: contentId,
      sourcePlatform: 'youtube',
      utm_source: 'youtube',
    },
    mode: 'subscription',
    payment_status: 'paid',
    subscription: 'sub_123',
  } as unknown as Stripe.Checkout.Session;

  const mockManagedCheckoutSession = {
    customer: 'cus_managed',
    customer_details: {
      email: 'managed@example.com',
    },
    id: 'cs_managed',
    metadata: {
      credits: '109900',
      email: 'managed@example.com',
      firstName: 'Vincent',
      type: 'managed_inference',
    },
    mode: 'payment',
    payment_status: 'paid',
  } as unknown as Stripe.Checkout.Session;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: SubscriptionsService,
          useValue: {
            findByStripeCustomerId: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
            syncSubscriptionToClerkMetadata: vi.fn(),
          },
        },
        {
          provide: ApiKeysService,
          useValue: {
            createWithKey: vi.fn(),
            findOne: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            addOrganizationCreditsWithExpiration: vi.fn(),
            getOrganizationCreditsBalance: vi.fn(),
          },
        },
        {
          provide: ActivitiesService,
          useValue: { create: vi.fn() },
        },
        {
          provide: UsersService,
          useValue: {
            create: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: ClerkService,
          useValue: {
            createUser: vi.fn(),
            getUserByEmail: vi.fn(),
            updateUserPublicMetadata: vi.fn(),
          },
        },
        {
          provide: ManagedStripeCheckoutService,
          useValue: {
            cacheCheckoutResult: vi.fn().mockResolvedValue(true),
            getCheckoutResult: vi.fn().mockResolvedValue(null),
            isSessionProvisioned: vi.fn().mockResolvedValue(false),
            logProvisioningContention: vi.fn(),
            markSessionProvisioned: vi.fn().mockResolvedValue(true),
            withProvisioningLock: vi
              .fn()
              .mockImplementation(
                async (_sessionId: string, fn: () => Promise<unknown>) =>
                  await fn(),
              ),
          },
        },
        {
          provide: StripeService,
          useValue: {
            getSubscription: vi.fn(),
          },
        },
        {
          provide: SubscriptionAttributionsService,
          useValue: {
            trackSubscription: vi.fn(),
          },
        },
        {
          provide: UserSubscriptionsService,
          useValue: {
            updateFromStripeSession: vi.fn(),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findOne: vi.fn(),
            getLatestMajorVersionModelIds: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: RequestContextCacheService,
          useValue: {
            invalidateForOrganization: vi.fn(),
            invalidateForUser: vi.fn(),
          },
        },
        {
          provide: AccessBootstrapCacheService,
          useValue: {
            invalidateForOrganization: vi.fn(),
            invalidateForUser: vi.fn(),
          },
        },
        {
          provide: getModelToken(SkillReceipt.name, DB_CONNECTIONS.CLOUD),
          useFactory: () => {
            function MockSkillReceiptModel(
              this: Record<string, unknown>,
              data: Record<string, unknown>,
            ) {
              Object.assign(this, data);
              this.save = vi.fn().mockResolvedValue(data);
            }
            MockSkillReceiptModel.find = vi
              .fn()
              .mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });
            MockSkillReceiptModel.findOne = vi
              .fn()
              .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
            MockSkillReceiptModel.findByIdAndUpdate = vi
              .fn()
              .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
            return MockSkillReceiptModel;
          },
        },
      ],
    }).compile();

    service = module.get(StripeWebhookService);
    apiKeysService = module.get(ApiKeysService);
    brandsService = module.get(BrandsService);
    clerkService = module.get(ClerkService);
    creditsUtilsService = module.get(CreditsUtilsService);
    managedStripeCheckoutService = module.get(ManagedStripeCheckoutService);
    organizationsService = module.get(OrganizationsService);
    subscriptionsService = module.get(SubscriptionsService);
    subscriptionAttributionsService = module.get(
      SubscriptionAttributionsService,
    );
    stripeService = module.get(StripeService);
    usersService = module.get(UsersService);
    loggerService = module.get(LoggerService);
  });

  it('records subscription attribution when checkout completes', async () => {
    subscriptionsService.findByStripeCustomerId.mockResolvedValue({
      organization: organizationId,
      stripePriceId: 'price_legacy',
      user: userId,
    } as unknown as Stripe.Event);

    usersService.findOne.mockResolvedValue({
      _id: userId,
      email: 'owner@example.com',
    } as unknown as Stripe.Event);

    stripeService.getSubscription.mockResolvedValue(mockSubscription);

    await service.handleCheckoutCompleted(mockCheckoutSession, '/webhook');

    expect(
      subscriptionAttributionsService.trackSubscription,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'USD',
        sourceContentId: contentId,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      }),
      organizationId.toString(),
    );
  });

  it('provisions a managed checkout account and caches the plain API key', async () => {
    vi.mocked(clerkService.getUserByEmail).mockResolvedValue(null);
    vi.mocked(clerkService.createUser).mockResolvedValue({
      id: 'user_clerk_1',
    } as never);

    usersService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    usersService.create.mockResolvedValue({
      _id: userId,
      clerkId: 'user_clerk_1',
      isOnboardingCompleted: false,
      onboardingStepsCompleted: [],
    } as never);
    usersService.patch.mockResolvedValue({
      _id: userId,
      clerkId: 'user_clerk_1',
      isOnboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      onboardingStepsCompleted: ['brand', 'plan'],
    } as never);

    vi.mocked(subscriptionsService.findByStripeCustomerId).mockResolvedValue(
      null as never,
    );
    vi.mocked(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).mockResolvedValue(undefined);
    vi.mocked(
      creditsUtilsService.getOrganizationCreditsBalance,
    ).mockResolvedValue(109900);
    vi.mocked(apiKeysService.findOne).mockResolvedValue(null);
    vi.mocked(apiKeysService.createWithKey).mockResolvedValue({
      apiKey: { _id: '507f191e810c19729de860ee' } as never,
      plainKey: 'gf_test_managed',
    });

    vi.mocked(organizationsService.findOne).mockResolvedValue({
      _id: organizationId,
    } as never);

    vi.mocked(brandsService.findOne).mockResolvedValue({
      _id: '507f191e810c19729de860ee',
    } as never);

    await service.handleCheckoutCompleted(
      mockManagedCheckoutSession,
      '/webhook',
    );

    expect(clerkService.createUser).toHaveBeenCalled();
    expect(apiKeysService.createWithKey).toHaveBeenCalled();
    expect(
      managedStripeCheckoutService.cacheCheckoutResult,
    ).toHaveBeenCalledWith(
      'cs_managed',
      expect.objectContaining({
        apiKey: 'gf_test_managed',
        apiKeyAlreadyExists: false,
        email: 'managed@example.com',
      }),
    );
  });

  // NOTE: charge.dispute.created, charge.dispute.closed, and charge.refunded
  // tests were removed — marketplace purchase webhooks are now handled by the
  // extracted marketplace service.
});
