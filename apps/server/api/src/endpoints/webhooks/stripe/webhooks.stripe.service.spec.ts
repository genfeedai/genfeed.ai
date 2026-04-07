import { ActivitiesService } from '@api/collections/activities/services/activities.service';
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
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { SkillReceipt } from '@api/skills-pro/schemas/skill-receipt.schema';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import Stripe from 'stripe';

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let subscriptionsService: vi.Mocked<SubscriptionsService>;
  let subscriptionAttributionsService: vi.Mocked<SubscriptionAttributionsService>;
  let stripeService: vi.Mocked<StripeService>;
  let usersService: vi.Mocked<UsersService>;
  let loggerService: { error: vi.Mock; log: vi.Mock; warn: vi.Mock };

  const organizationId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const contentId = new Types.ObjectId().toString();

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
            findOne: vi.fn(),
          },
        },
        {
          provide: ClerkService,
          useValue: {
            updateUserPublicMetadata: vi.fn(),
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

  // NOTE: charge.dispute.created, charge.dispute.closed, and charge.refunded
  // tests were removed — marketplace purchase webhooks are now handled by the
  // extracted marketplace service.
});
