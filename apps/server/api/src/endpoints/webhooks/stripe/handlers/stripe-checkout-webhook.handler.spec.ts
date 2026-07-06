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
  const prisma = { skillReceipt: { create: vi.fn(), findMany: vi.fn() } };
  const accessBootstrapCacheService = { invalidateForUser: vi.fn() };
  const userSetupService = { initializeUserResources: vi.fn() };
  const eventEmitter = { emitAsync: vi.fn() };
  const supportService = {
    addPurchasedCredits: vi.fn(),
    buildCheckoutSessionCreditReference: vi.fn(),
    invalidateOrganizationCaches: vi.fn(),
    invalidateUserCaches: vi.fn(),
    markOnboardingComplete: vi.fn(),
    markOnboardingCompleteFromSession: vi.fn(),
    recordCreditsActivity: vi.fn(),
    resolveCheckoutCredits: vi.fn().mockReturnValue(100),
    withCheckoutSessionProcessing: vi.fn(),
  };
  const attributionTracker = {
    trackSubscriptionAttributionFromSession: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(35_000);
    supportService.addPurchasedCredits.mockResolvedValue(true);
    supportService.buildCheckoutSessionCreditReference.mockImplementation(
      (kind: string, sessionId: string) => ({
        referenceId: sessionId,
        referenceType: `stripe-checkout-session:${kind}`,
      }),
    );
    supportService.resolveCheckoutCredits.mockReturnValue(100);
    supportService.withCheckoutSessionProcessing.mockImplementation(
      async (_sessionId: string, _kind: string, fn: () => Promise<unknown>) =>
        await fn(),
    );
    prisma.skillReceipt.findMany.mockResolvedValue([]);

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
        {
          referenceId: 'cs_payg_1',
          referenceType: 'stripe-checkout-session:organization-payment',
        },
      );
      expect(supportService.recordCreditsActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_1',
          userId: 'user_1',
          value: '100',
        }),
      );
      expect(supportService.withCheckoutSessionProcessing).toHaveBeenCalledWith(
        'cs_payg_1',
        'organization-payment',
        expect.any(Function),
      );
      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_1',
        isDeleted: false,
      });
      expect(supportService.markOnboardingComplete).toHaveBeenCalled();
      expect(supportService.invalidateUserCaches).toHaveBeenCalledWith(
        'user_1',
      );
    });

    it('does not grant duplicate PAYG credits for an already processed session', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue({
        id: 'sub_db_1',
        organization: 'org_1',
        user: 'user_1',
      });
      supportService.withCheckoutSessionProcessing.mockResolvedValueOnce(null);

      await handler.handleCheckoutCompleted(session, 'test');

      expect(supportService.addPurchasedCredits).not.toHaveBeenCalled();
      expect(supportService.recordCreditsActivity).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('PAYG checkout already processed'),
        expect.objectContaining({ sessionId: 'cs_payg_1' }),
      );
    });

    it('does not record duplicate PAYG activity when a retry finds an existing credit grant', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue({
        id: 'sub_db_1',
        organization: 'org_1',
        user: 'user_1',
      });
      supportService.addPurchasedCredits.mockResolvedValueOnce(false);

      await handler.handleCheckoutCompleted(session, 'test');

      expect(supportService.addPurchasedCredits).toHaveBeenCalledWith(
        'org_1',
        100,
        'pay-as-you-go',
        expect.stringContaining('100 credits'),
        {
          referenceId: 'cs_payg_1',
          referenceType: 'stripe-checkout-session:organization-payment',
        },
      );
      expect(
        creditsUtilsService.getOrganizationCreditsBalance,
      ).not.toHaveBeenCalled();
      expect(supportService.recordCreditsActivity).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('PAYG checkout credit grant already exists'),
        expect.objectContaining({ sessionId: 'cs_payg_1' }),
      );
    });

    it('omits the activity user when the subscription user is soft-deleted or missing', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue({
        id: 'sub_db_1',
        organization: 'org_1',
        user: 'user_deleted_1',
      });
      usersService.findOne.mockResolvedValue(null);

      await handler.handleCheckoutCompleted(session, 'test');

      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_deleted_1',
        isDeleted: false,
      });
      expect(supportService.recordCreditsActivity).toHaveBeenCalledWith(
        expect.not.objectContaining({ userId: expect.any(String) }),
      );
      expect(
        supportService.markOnboardingCompleteFromSession,
      ).toHaveBeenCalledWith(session, 'test');
    });

    it('rethrows PAYG processing failures after logging', async () => {
      const error = new Error('credit write failed');
      subscriptionsService.findByStripeCustomerId.mockResolvedValue({
        id: 'sub_db_1',
        organization: 'org_1',
        user: 'user_1',
      });
      supportService.addPurchasedCredits.mockRejectedValueOnce(error);

      await expect(
        handler.handleCheckoutCompleted(session, 'test'),
      ).rejects.toThrow(error);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to handle checkout completed'),
        error,
      );
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

  describe('handleCheckoutCompleted — managed inference', () => {
    const email = 'ada@example.com';
    const session = {
      customer: 'cus_managed_1',
      customer_details: { email },
      id: 'cs_managed_1',
      metadata: {
        credits: '100',
        firstName: 'Ada',
        lastName: 'Lovelace',
        type: 'managed_inference',
      },
    } as unknown as StripeCheckoutSession;

    beforeEach(() => {
      managedStripeCheckoutService.withProvisioningLock.mockImplementation(
        async (_sessionId: string, fn: () => Promise<unknown>) => await fn(),
      );
      managedStripeCheckoutService.isSessionProvisioned.mockResolvedValue(
        false,
      );
      managedStripeCheckoutService.getCheckoutResult.mockResolvedValue(null);
      managedStripeCheckoutService.cacheCheckoutResult.mockResolvedValue(true);
      managedStripeCheckoutService.markSessionProvisioned.mockResolvedValue(
        true,
      );
      usersService.findOne.mockResolvedValue({
        id: 'user_managed_1',
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      });
      organizationsService.findOne.mockResolvedValue({ id: 'org_managed_1' });
      brandsService.findOne.mockResolvedValue({ id: 'brand_managed_1' });
      organizationSettingsService.findOne.mockResolvedValue({
        id: 'settings_managed_1',
      });
      organizationSettingsService.patch.mockResolvedValue({});
      apiKeysService.findOne.mockResolvedValue({
        id: 'key_managed_1',
        scopes: [],
      });
      apiKeysService.patch.mockResolvedValue({});
      usersService.patch.mockResolvedValue({});
      supportService.recordCreditsActivity.mockResolvedValue(undefined);
      accessBootstrapCacheService.invalidateForUser.mockResolvedValue(
        undefined,
      );
    });

    it('passes a managed-inference checkout reference into the credit grant', async () => {
      await handler.handleCheckoutCompleted(session, 'test');

      expect(supportService.addPurchasedCredits).toHaveBeenCalledWith(
        'org_managed_1',
        100,
        'managed-inference',
        expect.stringContaining('100 credits'),
        {
          referenceId: 'cs_managed_1',
          referenceType: 'stripe-checkout-session:managed-inference',
        },
      );
      expect(
        managedStripeCheckoutService.cacheCheckoutResult,
      ).toHaveBeenCalledWith(
        'cs_managed_1',
        expect.objectContaining({
          organizationId: 'org_managed_1',
          userId: 'user_managed_1',
        }),
      );
      expect(
        managedStripeCheckoutService.markSessionProvisioned,
      ).toHaveBeenCalledWith('cs_managed_1');
    });

    it('does not throw when managed post-grant Redis writes fail', async () => {
      managedStripeCheckoutService.cacheCheckoutResult.mockRejectedValueOnce(
        new Error('redis unavailable'),
      );
      managedStripeCheckoutService.markSessionProvisioned.mockResolvedValueOnce(
        false,
      );

      await expect(
        handler.handleCheckoutCompleted(session, 'test'),
      ).resolves.toBeUndefined();

      expect(supportService.addPurchasedCredits).toHaveBeenCalledTimes(1);
      expect(supportService.recordCreditsActivity).toHaveBeenCalledTimes(1);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to cache managed checkout result'),
        expect.objectContaining({
          error: 'redis unavailable',
          sessionId: 'cs_managed_1',
        }),
      );
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'failed to mark managed checkout session as provisioned',
        ),
        expect.objectContaining({ sessionId: 'cs_managed_1' }),
      );
    });

    it('does not record duplicate managed credit activity on a retry after Redis marker failures', async () => {
      managedStripeCheckoutService.cacheCheckoutResult.mockRejectedValue(
        new Error('redis unavailable'),
      );
      managedStripeCheckoutService.markSessionProvisioned.mockResolvedValue(
        false,
      );
      supportService.addPurchasedCredits
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await handler.handleCheckoutCompleted(session, 'test');
      await handler.handleCheckoutCompleted(session, 'test');

      expect(supportService.addPurchasedCredits).toHaveBeenCalledTimes(2);
      expect(supportService.addPurchasedCredits).toHaveBeenNthCalledWith(
        2,
        'org_managed_1',
        100,
        'managed-inference',
        expect.stringContaining('100 credits'),
        {
          referenceId: 'cs_managed_1',
          referenceType: 'stripe-checkout-session:managed-inference',
        },
      );
      expect(supportService.recordCreditsActivity).toHaveBeenCalledTimes(1);
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('managed checkout credit grant already exists'),
        expect.objectContaining({
          organizationId: 'org_managed_1',
          sessionId: 'cs_managed_1',
          userId: 'user_managed_1',
        }),
      );
    });
  });

  describe('handleCheckoutCompleted — user credits', () => {
    const session = {
      customer: 'cus_user',
      id: 'cs_user_1',
      metadata: { credits: '100', type: 'user', userId: 'user_1' },
      mode: 'payment',
    } as unknown as StripeCheckoutSession;

    beforeEach(() => {
      usersService.findOne.mockResolvedValue({ id: 'user_1' });
      organizationsService.findOne.mockResolvedValue({ id: 'org_creator' });
    });

    it('adds purchased credits to the user creator organization once', async () => {
      await handler.handleCheckoutCompleted(session, 'test');

      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_1',
        isDeleted: false,
      });
      expect(supportService.withCheckoutSessionProcessing).toHaveBeenCalledWith(
        'cs_user_1',
        'user-credit',
        expect.any(Function),
      );
      expect(supportService.addPurchasedCredits).toHaveBeenCalledWith(
        'org_creator',
        100,
        'user-purchase',
        expect.stringContaining('100 credits'),
        {
          referenceId: 'cs_user_1',
          referenceType: 'stripe-checkout-session:user-credit',
        },
      );
      expect(
        userSubscriptionsService.updateFromStripeSession,
      ).toHaveBeenCalledWith('user_1', session);
    });

    it('does not grant duplicate user credits for an already processed session', async () => {
      supportService.withCheckoutSessionProcessing.mockResolvedValueOnce(null);

      await handler.handleCheckoutCompleted(session, 'test');

      expect(supportService.addPurchasedCredits).not.toHaveBeenCalled();
      expect(
        userSubscriptionsService.updateFromStripeSession,
      ).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('user checkout already processed'),
        expect.objectContaining({ sessionId: 'cs_user_1' }),
      );
    });
  });

  describe('handleCheckoutCompleted — skills-pro', () => {
    const session = {
      amount_total: 4900,
      currency: 'usd',
      customer_details: { email: 'buyer@example.com' },
      id: 'cs_skills_1',
      metadata: { type: 'skills-pro' },
      payment_intent: 'pi_1',
    } as unknown as StripeCheckoutSession;

    it('creates a skill receipt from the session', async () => {
      prisma.skillReceipt.create.mockResolvedValue({});

      await handler.handleCheckoutCompleted(session, 'test');

      expect(supportService.withCheckoutSessionProcessing).toHaveBeenCalledWith(
        'cs_skills_1',
        'skills-pro-receipt',
        expect.any(Function),
      );
      expect(prisma.skillReceipt.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
      });
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
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('skills-pro receipt created'),
        expect.objectContaining({
          emailDomain: 'example.com',
          sessionId: 'cs_skills_1',
        }),
      );
      expect(
        loggerService.log.mock.calls.find(([message]) =>
          String(message).includes('skills-pro receipt created'),
        )?.[1],
      ).not.toHaveProperty('email');
    });

    it('does not create a duplicate skills-pro receipt when the session is already processed', async () => {
      supportService.withCheckoutSessionProcessing.mockResolvedValueOnce(null);

      await handler.handleCheckoutCompleted(session, 'test');

      expect(prisma.skillReceipt.create).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('skills-pro checkout already processed'),
        expect.objectContaining({ sessionId: 'cs_skills_1' }),
      );
    });

    it('does not create a duplicate skills-pro receipt when a persisted receipt already has the session id', async () => {
      prisma.skillReceipt.findMany.mockResolvedValueOnce([
        { data: { stripeSessionId: 'cs_skills_1' } },
      ]);

      await handler.handleCheckoutCompleted(session, 'test');

      expect(prisma.skillReceipt.create).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('skills-pro receipt already exists'),
        expect.objectContaining({ sessionId: 'cs_skills_1' }),
      );
    });

    it('rethrows skills-pro receipt failures after logging', async () => {
      const error = new Error('receipt write failed');
      prisma.skillReceipt.create.mockRejectedValueOnce(error);

      await expect(
        handler.handleCheckoutCompleted(session, 'test'),
      ).rejects.toThrow(error);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'failed to handle skills-pro checkout completed',
        ),
        error,
      );
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
      supportService.addPurchasedCredits.mockResolvedValue(true);
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

    it('reuses an active user when email creation hits a unique constraint race', async () => {
      usersService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'user_existing_1',
        isDeleted: false,
        isOnboardingCompleted: false,
        onboardingStepsCompleted: [],
      });
      usersService.create.mockRejectedValueOnce({ code: 'P2002' });

      await provisionAccessor().provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(usersService.findOne).toHaveBeenNthCalledWith(1, {
        email,
        isDeleted: false,
      });
      expect(usersService.findOne).toHaveBeenNthCalledWith(2, {
        email,
        isDeleted: false,
      });
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(supportService.addPurchasedCredits).toHaveBeenCalled();
    });

    it('does not reactivate a soft-deleted user when email creation hits a unique constraint', async () => {
      const uniqueConflict = { code: 'P2002' };
      usersService.findOne.mockResolvedValue(null);
      usersService.create.mockRejectedValueOnce(uniqueConflict);

      await expect(
        provisionAccessor().provisionManagedCheckoutAccount(
          session as never,
          email,
          'test',
        ),
      ).rejects.toBe(uniqueConflict);

      expect(usersService.findOne).toHaveBeenNthCalledWith(1, {
        email,
        isDeleted: false,
      });
      expect(usersService.findOne).toHaveBeenNthCalledWith(2, {
        email,
        isDeleted: false,
      });
      expect(usersService.patch).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ isDeleted: false }),
      );
      expect(supportService.addPurchasedCredits).not.toHaveBeenCalled();
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
      expect(supportService.addPurchasedCredits).toHaveBeenCalledWith(
        'org_1',
        100,
        'managed-inference',
        expect.stringContaining('100 credits'),
        {
          referenceId: 'cs_test_1',
          referenceType: 'stripe-checkout-session:managed-inference',
        },
      );
    });

    it('skips duplicate managed credit activity when the grant already exists', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'user_existing_1',
        isOnboardingCompleted: true,
        onboardingStepsCompleted: ['brand', 'plan'],
      });
      supportService.addPurchasedCredits.mockResolvedValueOnce(false);

      await provisionAccessor().provisionManagedCheckoutAccount(
        session as never,
        email,
        'test',
      );

      expect(supportService.recordCreditsActivity).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('managed checkout credit grant already exists'),
        expect.objectContaining({
          organizationId: 'org_1',
          sessionId: 'cs_test_1',
          userId: 'user_existing_1',
        }),
      );
    });
  });
});
