import { BETTER_AUTH_USER_CREATED_EVENT } from '@api/auth/better-auth/better-auth.constants';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { StripeAttributionTrackerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-attribution-tracker.service';
import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type { ManagedCheckoutResult } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  SUBSCRIPTIONS_SERVICE,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProvisionAccessor = {
  provisionManagedCheckoutAccount(
    session: unknown,
    email: string,
    url: string,
  ): Promise<ManagedCheckoutResult>;
};

describe('StripeCheckoutWebhookHandler', () => {
  let handler: StripeCheckoutWebhookHandler;

  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const apiKeysService = {
    createWithKey: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const brandsService = { findOne: vi.fn() };
  const subscriptionsService = { findByStripeCustomerId: vi.fn() };
  const creditsUtilsService = {
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(35_000),
  };
  const usersService = { create: vi.fn(), findOne: vi.fn(), patch: vi.fn() };
  const managedStripeCheckoutService = {
    cacheCheckoutResult: vi.fn(),
    getCheckoutResult: vi.fn(),
    isSessionProvisioned: vi.fn(),
    logProvisioningContention: vi.fn(),
    markSessionProvisioned: vi.fn(),
    withProvisioningLock: vi.fn(),
  };
  const organizationsService = { findOne: vi.fn() };
  const userSubscriptionsService = { updateFromStripeSession: vi.fn() };
  const organizationSettingsService = { findOne: vi.fn(), patch: vi.fn() };
  const prisma = { skillReceipt: { create: vi.fn() } };
  const accessBootstrapCacheService = { invalidateForUser: vi.fn() };
  const userSetupService = { initializeUserResources: vi.fn() };
  const eventEmitter = { emitAsync: vi.fn() };
  const supportService = {
    addPurchasedCredits: vi.fn(),
    markOnboardingComplete: vi.fn(),
    markOnboardingCompleteFromSession: vi.fn(),
    recordCreditsActivity: vi.fn(),
    resolveCheckoutCredits: vi.fn().mockReturnValue(100),
  };
  const attributionTracker = {
    trackSubscriptionAttributionFromSession: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(35_000);
    supportService.resolveCheckoutCredits.mockReturnValue(100);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeCheckoutWebhookHandler,
        { provide: LoggerService, useValue: loggerService },
        { provide: ApiKeysService, useValue: apiKeysService },
        { provide: BrandsService, useValue: brandsService },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptionsService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: UsersService, useValue: usersService },
        {
          provide: ManagedStripeCheckoutService,
          useValue: managedStripeCheckoutService,
        },
        { provide: OrganizationsService, useValue: organizationsService },
        {
          provide: USER_SUBSCRIPTIONS_SERVICE,
          useValue: userSubscriptionsService,
        },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsService,
        },
        { provide: PrismaService, useValue: prisma },
        {
          provide: AccessBootstrapCacheService,
          useValue: accessBootstrapCacheService,
        },
        { provide: UserSetupService, useValue: userSetupService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: StripeWebhookSupportService, useValue: supportService },
        {
          provide: StripeAttributionTrackerService,
          useValue: attributionTracker,
        },
      ],
    }).compile();

    handler = module.get(StripeCheckoutWebhookHandler);
  });

  describe('handleCheckoutCompleted — payment mode (PAYG)', () => {
    const session = {
      customer: 'cus_123',
      id: 'cs_payg_1',
      metadata: { credits: '100' },
      mode: 'payment',
    } as unknown as StripeCheckoutSession;

    it('adds purchased credits and records the activity for the org', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue({
        id: 'sub_db_1',
        organization: 'org_1',
        user: 'user_1',
      });
      usersService.findOne.mockResolvedValue({
        id: 'user_1',
        isOnboardingCompleted: true,
      });

      await handler.handleCheckoutCompleted(session, 'test');

      expect(supportService.addPurchasedCredits).toHaveBeenCalledWith(
        'org_1',
        100,
        'pay-as-you-go',
        expect.stringContaining('100 credits'),
      );
      expect(supportService.recordCreditsActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_1',
          userId: 'user_1',
          value: '100',
        }),
      );
      expect(supportService.markOnboardingComplete).toHaveBeenCalled();
    });

    it('warns and adds nothing when no subscription matches the customer', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue(null);

      await handler.handleCheckoutCompleted(session, 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('subscription not found for payment'),
        expect.objectContaining({ customerId: 'cus_123' }),
      );
      expect(supportService.addPurchasedCredits).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckoutCompleted — unsupported session type', () => {
    it('warns and ignores unknown metadata types', async () => {
      await handler.handleCheckoutCompleted(
        {
          id: 'cs_unknown',
          metadata: { type: 'mystery' },
        } as unknown as StripeCheckoutSession,
        'test',
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('ignoring unsupported checkout session type'),
        { sessionId: 'cs_unknown', type: 'mystery' },
      );
      expect(supportService.addPurchasedCredits).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckoutCompleted — skills-pro', () => {
    it('creates a skill receipt from the session', async () => {
      prisma.skillReceipt.create.mockResolvedValue({});

      await handler.handleCheckoutCompleted(
        {
          amount_total: 4900,
          currency: 'usd',
          customer_details: { email: 'buyer@example.com' },
          id: 'cs_skills_1',
          metadata: { type: 'skills-pro' },
          payment_intent: 'pi_1',
        } as unknown as StripeCheckoutSession,
        'test',
      );

      expect(prisma.skillReceipt.create).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({
            amountPaid: 4900,
            email: 'buyer@example.com',
            productType: 'bundle',
            status: 'completed',
            stripeSessionId: 'cs_skills_1',
          }),
        },
      });
    });
  });

  describe('provisionManagedCheckoutAccount', () => {
    const email = 'ada@example.com';
    const session = {
      customer: 'cus_123',
      id: 'cs_test_1',
      metadata: { credits: '100', firstName: 'Ada', lastName: 'Lovelace' },
    };

    function provisionAccessor(): ProvisionAccessor {
      return handler as unknown as ProvisionAccessor;
    }

    beforeEach(() => {
      organizationsService.findOne.mockResolvedValue({ id: 'org_1' });
      brandsService.findOne.mockResolvedValue({ id: 'brand_1' });
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });
      organizationSettingsService.patch.mockResolvedValue({});
      supportService.addPurchasedCredits.mockResolvedValue(undefined);
      apiKeysService.findOne.mockResolvedValue({ id: 'key_1', scopes: [] });
      apiKeysService.patch.mockResolvedValue({});
      usersService.patch.mockResolvedValue({});
      supportService.recordCreditsActivity.mockResolvedValue(undefined);
      accessBootstrapCacheService.invalidateForUser.mockResolvedValue(
        undefined,
      );
      eventEmitter.emitAsync.mockResolvedValue([]);
    });

    it('creates a authProviderId-free user, mints a managed key, and emits better-auth.user.created for a net-new buyer', async () => {
      usersService.findOne.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        id: 'user_new_1',
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      });
      // A net-new buyer has no managed key yet → the createWithKey path runs.
      apiKeysService.findOne.mockResolvedValue(null);
      apiKeysService.createWithKey.mockResolvedValue({
        plainKey: 'gf_managed',
      });

      await provisionAccessor().provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(usersService.findOne).toHaveBeenCalledWith({
        email,
        isDeleted: false,
      });
      expect(usersService.create).toHaveBeenCalledTimes(1);
      const createArg = usersService.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(createArg.email).toBe(email);
      expect(createArg.authProviderId).toBeUndefined();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        BETTER_AUTH_USER_CREATED_EVENT,
        { email, userId: 'user_new_1' },
      );
      expect(apiKeysService.createWithKey).toHaveBeenCalledTimes(1);
    });

    it('reactivates a soft-deleted user when email creation hits a unique constraint race', async () => {
      usersService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'user_deleted_1',
        isDeleted: true,
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      });
      usersService.create.mockRejectedValueOnce({ code: 'P2002' });
      usersService.patch
        .mockResolvedValueOnce({
          id: 'user_deleted_1',
          isDeleted: false,
          isOnboardingCompleted: false,
          onboardingStepsCompleted: [],
        })
        .mockResolvedValueOnce({});

      await provisionAccessor().provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(usersService.findOne).toHaveBeenNthCalledWith(1, {
        email,
        isDeleted: false,
      });
      expect(usersService.findOne).toHaveBeenNthCalledWith(2, { email }, []);
      expect(usersService.patch).toHaveBeenNthCalledWith(1, 'user_deleted_1', {
        isDeleted: false,
      });
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(supportService.addPurchasedCredits).toHaveBeenCalled();
    });

    it('reuses an existing user by email, skips provisioning, but still tops up credits for a returning buyer', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'user_existing_1',
        isOnboardingCompleted: true,
        onboardingStepsCompleted: ['brand', 'plan'],
      });

      await provisionAccessor().provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(usersService.findOne).toHaveBeenCalledWith({
        email,
        isDeleted: false,
      });
      expect(usersService.create).not.toHaveBeenCalled();
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
      // Resources already exist, so the defensive setup fallback never fires …
      expect(userSetupService.initializeUserResources).not.toHaveBeenCalled();
      // … but the purchased credits are still granted.
      expect(supportService.addPurchasedCredits).toHaveBeenCalled();
    });
  });
});
