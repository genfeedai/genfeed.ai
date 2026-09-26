import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { CacheService } from '@api/services/cache/cache.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  CreditTransactionCategory,
  SubscriptionPlan,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeWebhookSupportService', () => {
  let service: StripeWebhookSupportService;

  const configService = { get: vi.fn().mockReturnValue(undefined) };
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const prisma = {
    creditTransaction: {
      findFirst: vi.fn(),
    },
    lead: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const activitiesService = { create: vi.fn() };
  const cacheService = {
    exists: vi.fn(),
    generateKey: vi.fn(),
    set: vi.fn(),
    withLock: vi.fn(),
  };
  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn(),
  };
  const organizationSettingsService = {
    findOne: vi.fn(),
    getLatestMajorVersionModelIds: vi.fn().mockResolvedValue(['model_1']),
    patch: vi.fn(),
  };
  const subscriptionsService = { findByStripeCustomerId: vi.fn() };
  const usersService = { findOne: vi.fn(), patch: vi.fn() };
  const requestContextCacheService = {
    invalidateForOrganization: vi.fn(),
    invalidateForUser: vi.fn(),
  };
  const accessBootstrapCacheService = {
    invalidateForOrganization: vi.fn(),
    invalidateForUser: vi.fn(),
  };
  const creditGrantService = {
    logUnresolvedGrant: vi.fn(),
    resolveMonthlyCredits: vi.fn(),
    resolvePlanCredits: vi.fn(),
    resolveTierFromPriceId: vi.fn().mockReturnValue(null),
  };

  const priceConfig: Record<string, string> = {
    STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'price_enterprise',
    STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'price_pro',
    STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY: 'price_pro_yearly',
    STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'price_scale',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    creditGrantService.resolveTierFromPriceId.mockReturnValue(null);
    cacheService.exists.mockResolvedValue(false);
    cacheService.generateKey.mockImplementation((namespace, ...parts) =>
      [namespace, ...parts].join(':'),
    );
    cacheService.set.mockResolvedValue(true);
    cacheService.withLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => await fn(),
    );
    prisma.creditTransaction.findFirst.mockResolvedValue(null);
    organizationSettingsService.getLatestMajorVersionModelIds.mockResolvedValue(
      ['model_1'],
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookSupportService,
        { provide: ConfigService, useValue: configService },
        { provide: CacheService, useValue: cacheService },
        { provide: LoggerService, useValue: loggerService },
        { provide: PrismaService, useValue: prisma },
        { provide: ActivitiesService, useValue: activitiesService },
        {
          provide: SubscriptionCreditGrantService,
          useValue: creditGrantService,
        },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsService,
        },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptionsService },
        { provide: UsersService, useValue: usersService },
        {
          provide: RequestContextCacheService,
          useValue: requestContextCacheService,
        },
        {
          provide: AccessBootstrapCacheService,
          useValue: accessBootstrapCacheService,
        },
      ],
    }).compile();

    service = module.get(StripeWebhookSupportService);
  });

  describe('resolveCheckoutCredits', () => {
    it('prefers the session metadata credits', () => {
      expect(service.resolveCheckoutCredits({ credits: '250' }, 0)).toBe(250);
    });

    it('falls back to the STRIPE_PAYG_CREDITS config value', () => {
      configService.get.mockReturnValue('500');

      expect(service.resolveCheckoutCredits({}, 0)).toBe(500);
    });

    it('uses the caller fallback when metadata and config are empty', () => {
      expect(service.resolveCheckoutCredits({}, 1)).toBe(1);
    });

    it('preserves the historical NaN when no fallback is given', () => {
      expect(service.resolveCheckoutCredits({})).toBeNaN();
    });
  });

  describe('withCheckoutSessionProcessing', () => {
    it('builds a managed-inference credit reference from the checkout session id', () => {
      expect(
        service.buildCheckoutSessionCreditReference(
          'managed-inference',
          'cs_managed_1',
        ),
      ).toEqual({
        referenceId: 'cs_managed_1',
        referenceType: 'stripe-checkout-session:managed-inference',
      });
    });

    it('runs the callback under a session lock and marks the session processed', async () => {
      const callback = vi.fn().mockResolvedValue('done');

      await expect(
        service.withCheckoutSessionProcessing('cs_1', 'user-credit', callback),
      ).resolves.toBe('done');

      expect(cacheService.withLock).toHaveBeenCalledWith(
        'stripe-checkout-session:user-credit:lock:cs_1',
        expect.any(Function),
        300,
      );
      expect(cacheService.exists).toHaveBeenCalledWith(
        'stripe-checkout-session:user-credit:processed:cs_1',
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(cacheService.set).toHaveBeenCalledWith(
        'stripe-checkout-session:user-credit:processed:cs_1',
        expect.objectContaining({
          kind: 'user-credit',
          sessionId: 'cs_1',
        }),
        expect.objectContaining({
          tags: ['stripe-checkout-session', 'user-credit', 'cs_1'],
          ttl: 2_592_000,
        }),
      );
    });

    it('returns null without running the callback for an already processed session', async () => {
      cacheService.exists.mockResolvedValue(true);
      const callback = vi.fn();

      await expect(
        service.withCheckoutSessionProcessing('cs_1', 'user-credit', callback),
      ).resolves.toBeNull();

      expect(callback).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('does not apply an idempotent credit side effect twice when Redis marker writes fail', async () => {
      const appliedGrants = new Set<string>();
      const reference = service.buildCheckoutSessionCreditReference(
        'organization-payment',
        'cs_retry_1',
      );
      const grantKey = [
        'org_1',
        'pay-as-you-go',
        reference.referenceType,
        reference.referenceId,
      ].join(':');

      cacheService.exists.mockResolvedValue(false);
      cacheService.set
        .mockRejectedValueOnce(new Error('redis unavailable'))
        .mockResolvedValueOnce(false);
      prisma.creditTransaction.findFirst.mockImplementation(async () =>
        appliedGrants.has(grantKey) ? { id: 'txn_1' } : null,
      );
      creditsUtilsService.addOrganizationCreditsWithExpiration.mockImplementation(
        async () => {
          appliedGrants.add(grantKey);
        },
      );

      const runGrant = async () =>
        await service.withCheckoutSessionProcessing(
          'cs_retry_1',
          'organization-payment',
          async () =>
            await service.addPurchasedCredits(
              'org_1',
              100,
              'pay-as-you-go',
              'Credit pack purchase (100 credits)',
              reference,
            ),
        );

      await expect(runGrant()).resolves.toBe(true);
      await expect(runGrant()).resolves.toBe(false);

      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledTimes(1);
      expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          category: CreditTransactionCategory.ADD,
          isDeleted: false,
          organizationId: 'org_1',
          referenceId: 'cs_retry_1',
          referenceType: 'stripe-checkout-session:organization-payment',
          source: 'pay-as-you-go',
        },
      });
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'failed to cache Stripe checkout processed marker',
        ),
        expect.objectContaining({ sessionId: 'cs_retry_1' }),
      );
    });
  });

  describe('addPurchasedCredits', () => {
    it('adds credits with a 1-year expiration', async () => {
      await expect(
        service.addPurchasedCredits('org_1', 100, 'pay-as-you-go', 'desc'),
      ).resolves.toBe(true);

      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        'org_1',
        100,
        'pay-as-you-go',
        'desc',
        expect.any(Date),
      );

      const expiry = creditsUtilsService.addOrganizationCreditsWithExpiration
        .mock.calls[0][4] as Date;
      const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
      expect(Math.abs(expiry.getTime() - oneYearFromNow)).toBeLessThan(5_000);
    });
  });

  describe('hasSubscriptionCreditGrant', () => {
    it('returns false when no matching credit transaction exists', async () => {
      prisma.creditTransaction.findFirst.mockResolvedValue(null);

      await expect(
        service.hasSubscriptionCreditGrant('org_1', {
          reference: {
            referenceId: 'stripe-invoice:in_123',
            referenceType: 'stripe-invoice:subscription-grant',
          },
        }),
      ).resolves.toBe(false);

      expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: 'org_1',
          OR: [
            {
              referenceId: 'stripe-invoice:in_123',
              referenceType: 'stripe-invoice:subscription-grant',
            },
          ],
        },
      });
    });

    it('returns true when a matching credit transaction exists, without filtering by category', async () => {
      prisma.creditTransaction.findFirst.mockResolvedValue({ id: 'txn_1' });

      await expect(
        service.hasSubscriptionCreditGrant('org_1', {
          reference: {
            referenceId: 'stripe-invoice:in_123',
            referenceType: 'stripe-invoice:subscription-grant',
          },
        }),
      ).resolves.toBe(true);

      const where = prisma.creditTransaction.findFirst.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('category');
    });

    it('recognizes legacy invoice grants from the same subscription period', async () => {
      prisma.creditTransaction.findFirst.mockResolvedValue({ id: 'txn_1' });
      const periodStart = new Date('2026-07-01T00:00:00.000Z');
      const periodEnd = new Date('2026-08-01T00:00:00.000Z');

      await expect(
        service.hasSubscriptionCreditGrant('org_1', {
          legacyPeriod: {
            end: periodEnd,
            source: 'monthly',
            start: periodStart,
          },
          reference: {
            referenceId: 'stripe-subscription:sub_123',
            referenceType: 'stripe-subscription:initial-grant',
          },
        }),
      ).resolves.toBe(true);

      expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          isDeleted: false,
          organizationId: 'org_1',
          OR: [
            {
              referenceId: 'stripe-subscription:sub_123',
              referenceType: 'stripe-subscription:initial-grant',
            },
            {
              createdAt: { gte: periodStart, lt: periodEnd },
              referenceType: 'stripe-invoice:subscription-grant',
              source: 'monthly',
            },
          ],
        },
      });
    });
  });

  describe('isUniqueConstraintError', () => {
    it('returns true for a Prisma P2002 error', () => {
      expect(service.isUniqueConstraintError({ code: 'P2002' })).toBe(true);
    });

    it('returns false for other error codes', () => {
      expect(service.isUniqueConstraintError({ code: 'P2025' })).toBe(false);
    });

    it('returns false for non-object errors', () => {
      expect(service.isUniqueConstraintError(new Error('boom'))).toBe(false);
      expect(service.isUniqueConstraintError(null)).toBe(false);
      expect(service.isUniqueConstraintError(undefined)).toBe(false);
    });
  });

  describe('recordCreditsActivity', () => {
    it('defaults to CREDITS_ADD and includes the user when given', async () => {
      await service.recordCreditsActivity({
        brandId: 'brand_1',
        organizationId: 'org_1',
        source: ActivitySource.PAY_AS_YOU_GO,
        userId: 'user_1',
        value: '100',
      });

      expect(activitiesService.create).toHaveBeenCalledWith({
        brandId: 'brand_1',
        key: ActivityKey.CREDITS_ADD,
        organizationId: 'org_1',
        source: ActivitySource.PAY_AS_YOU_GO,
        userId: 'user_1',
        value: '100',
      });
    });

    it('omits the user field when none is given', async () => {
      await service.recordCreditsActivity({
        brandId: 'org_1',
        organizationId: 'org_1',
        source: ActivitySource.SUBSCRIPTION,
        value: 'Subscription credits granted',
      });

      expect(activitiesService.create).toHaveBeenCalledWith({
        brandId: 'org_1',
        key: ActivityKey.CREDITS_ADD,
        organizationId: 'org_1',
        source: ActivitySource.SUBSCRIPTION,
        value: 'Subscription credits granted',
      });
    });
  });

  describe('markOnboardingComplete', () => {
    it('patches the onboarding fields for incomplete users', async () => {
      await service.markOnboardingComplete({
        id: 'user_1',
        isOnboardingCompleted: false,
      });

      expect(usersService.patch).toHaveBeenCalledWith('user_1', {
        isOnboardingCompleted: true,
        onboardingCompletedAt: expect.any(Date),
        onboardingStepsCompleted: ['brand', 'providers', 'summary'],
      });
    });

    it('is a no-op for already-onboarded users', async () => {
      await service.markOnboardingComplete({
        id: 'user_1',
        isOnboardingCompleted: true,
      });

      expect(usersService.patch).not.toHaveBeenCalled();
    });
  });

  describe('markOnboardingCompleteFromSession', () => {
    const session = {
      customer: 'cus_123',
      customer_details: { email: 'ada@example.com' },
      id: 'cs_1',
    } as unknown as StripeCheckoutSession;

    it('warns when no user can be resolved', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue(null);
      usersService.findOne.mockResolvedValue(null);

      await service.markOnboardingCompleteFromSession(session, 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'could not find user for onboarding completion',
        ),
        expect.objectContaining({
          customerId: 'cus_123',
          emailDomain: 'example.com',
        }),
      );
      expect(loggerService.warn.mock.calls[0][1]).not.toHaveProperty('email');
      expect(usersService.patch).not.toHaveBeenCalled();
    });

    it('falls back to the session email and completes onboarding', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue(null);
      usersService.findOne.mockResolvedValue({
        id: 'user_1',
        email: 'ada@example.com',
        isOnboardingCompleted: false,
      });

      await service.markOnboardingCompleteFromSession(session, 'test');

      expect(usersService.findOne).toHaveBeenCalledWith({
        email: 'ada@example.com',
      });
      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        'user_1',
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith('user_1');
      expect(usersService.patch).toHaveBeenCalledWith(
        'user_1',
        expect.objectContaining({ isOnboardingCompleted: true }),
      );
      expect(usersService.patch.mock.invocationCallOrder[0]).toBeLessThan(
        requestContextCacheService.invalidateForUser.mock
          .invocationCallOrder[0],
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('onboarding marked complete'),
        expect.objectContaining({ emailDomain: 'example.com' }),
      );
      expect(loggerService.log.mock.calls[0][1]).not.toHaveProperty('email');
    });
  });

  describe('setHasEverHadCredits', () => {
    it('patches the org setting when found', async () => {
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });

      await service.setHasEverHadCredits('org_1', 'test');

      expect(organizationSettingsService.patch).toHaveBeenCalledWith('os_1', {
        hasEverHadCredits: true,
      });
      expect(
        requestContextCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_1');
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_1');
      expect(
        organizationSettingsService.patch.mock.invocationCallOrder[0],
      ).toBeLessThan(
        requestContextCacheService.invalidateForOrganization.mock
          .invocationCallOrder[0],
      );
    });

    it('warns instead of throwing when the patch fails', async () => {
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });
      organizationSettingsService.patch.mockRejectedValueOnce(
        new Error('boom'),
      );

      await service.setHasEverHadCredits('org_1', 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to set hasEverHadCredits flag'),
        expect.objectContaining({ organizationId: 'org_1' }),
      );
    });
  });

  describe('invalidateUserCaches', () => {
    it('invalidates both per-user caches', async () => {
      await service.invalidateUserCaches('user_1');

      expect(requestContextCacheService.invalidateForUser).toHaveBeenCalledWith(
        'user_1',
      );
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith('user_1');
    });
  });

  describe('invalidateOrganizationCaches', () => {
    it('invalidates both per-organization caches', async () => {
      await service.invalidateOrganizationCaches('org_1');

      expect(
        requestContextCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_1');
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_1');
    });
  });

  describe('resolveSubscriptionPlan', () => {
    it('maps the enterprise price to the enterprise plan', () => {
      configService.get.mockImplementation((key: string) => priceConfig[key]);

      expect(service.resolveSubscriptionPlan('price_enterprise')).toBe(
        SubscriptionPlan.ENTERPRISE,
      );
    });

    it('maps tier prices to the monthly plan', () => {
      configService.get.mockImplementation((key: string) => priceConfig[key]);

      expect(service.resolveSubscriptionPlan('price_pro')).toBe(
        SubscriptionPlan.MONTHLY,
      );
    });

    it('maps yearly recurring intervals to the yearly plan', () => {
      expect(service.resolveSubscriptionPlan('price_unknown', 'year')).toBe(
        SubscriptionPlan.YEARLY,
      );
    });

    it('defaults unknown prices to monthly with a warning', () => {
      expect(service.resolveSubscriptionPlan('price_unknown')).toBe(
        SubscriptionPlan.MONTHLY,
      );
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown price ID'),
        { stripePriceId: 'price_unknown' },
      );
    });
  });

  describe('resolveTierFromPriceId', () => {
    // The mapping itself is owned and tested by SubscriptionCreditGrantService;
    // a second copy here is what let a webhook and a grant disagree on a tier.
    it('delegates the mapping to the credit grant service', () => {
      creditGrantService.resolveTierFromPriceId.mockReturnValue(
        SubscriptionTier.SCALE,
      );

      expect(service.resolveTierFromPriceId('price_scale')).toBe(
        SubscriptionTier.SCALE,
      );
      expect(creditGrantService.resolveTierFromPriceId).toHaveBeenCalledWith(
        'price_scale',
      );
    });

    it('returns null for unknown prices', () => {
      expect(service.resolveTierFromPriceId('price_unknown')).toBeNull();
    });
  });

  describe('updateOrganizationTierAndModels', () => {
    it('patches the tier and refreshed model list', async () => {
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });

      await service.updateOrganizationTierAndModels(
        'org_1',
        SubscriptionTier.PRO,
        'test',
      );

      expect(organizationSettingsService.patch).toHaveBeenCalledWith('os_1', {
        enabledModelIds: ['model_1'],
        subscriptionTier: SubscriptionTier.PRO,
      });
      expect(
        requestContextCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_1');
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_1');
      expect(
        organizationSettingsService.patch.mock.invocationCallOrder[0],
      ).toBeLessThan(
        requestContextCacheService.invalidateForOrganization.mock
          .invocationCallOrder[0],
      );
    });

    it('warns when the org settings are missing', async () => {
      organizationSettingsService.findOne.mockResolvedValue(null);

      await service.updateOrganizationTierAndModels(
        'org_1',
        SubscriptionTier.PRO,
        'test',
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('org settings not found for tier update'),
        { organizationId: 'org_1', tier: SubscriptionTier.PRO },
      );
      expect(organizationSettingsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('upsertSkillsProLead', () => {
    it('creates a lead for a first-time buyer', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({ id: 'lead_1' });

      await service.upsertSkillsProLead({
        email: 'buyer@example.com',
        organizationId: 'org_1',
        productType: 'bundle',
        receiptId: 'sk_rcpt_1',
        skillSlugs: ['image-gen-pro'],
        userId: 'user_1',
      });

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: {
          data: { equals: 'skills-pro', path: ['source'] },
          isDeleted: false,
          userId: 'user_1',
        },
      });
      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({
            email: 'buyer@example.com',
            productType: 'bundle',
            receiptId: 'sk_rcpt_1',
            skillSlugs: ['image-gen-pro'],
            source: 'skills-pro',
          }),
          organizationId: 'org_1',
          userId: 'user_1',
        },
      });
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it('updates the existing lead for a repeat buyer instead of duplicating it', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead_existing' });

      await service.upsertSkillsProLead({
        email: 'buyer@example.com',
        organizationId: null,
        productType: 'skill',
        receiptId: 'sk_rcpt_2',
        skillSlugs: [],
        userId: 'user_1',
      });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({ receiptId: 'sk_rcpt_2' }),
        },
        where: { id: 'lead_existing' },
      });
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('logs and swallows a failure instead of throwing', async () => {
      prisma.lead.findFirst.mockRejectedValue(new Error('db down'));

      await expect(
        service.upsertSkillsProLead({
          email: 'buyer@example.com',
          organizationId: 'org_1',
          productType: 'bundle',
          receiptId: 'sk_rcpt_3',
          skillSlugs: [],
          userId: 'user_1',
        }),
      ).resolves.toBeUndefined();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to upsert skills-pro lead'),
        expect.objectContaining({ receiptId: 'sk_rcpt_3', userId: 'user_1' }),
      );
    });
  });

  describe('upsertSubscriptionLead', () => {
    it('creates a lead for a new Pro/Scale organization', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({ id: 'lead_1' });

      await service.upsertSubscriptionLead({
        organizationId: 'org_1',
        stripeSubscriptionId: 'sub_1',
        tier: SubscriptionTier.PRO,
        userId: 'user_1',
      });

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: {
          data: { equals: 'subscription', path: ['source'] },
          isDeleted: false,
          organizationId: 'org_1',
        },
      });
      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({
            source: 'subscription',
            stripeSubscriptionId: 'sub_1',
            tier: SubscriptionTier.PRO,
          }),
          organizationId: 'org_1',
          userId: 'user_1',
        },
      });
    });

    it('updates the existing organization lead, scoped by organization', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead_existing' });

      await service.upsertSubscriptionLead({
        organizationId: 'org_1',
        stripeSubscriptionId: 'sub_1',
        tier: SubscriptionTier.SCALE,
        userId: 'user_1',
      });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        data: {
          data: expect.objectContaining({ tier: SubscriptionTier.SCALE }),
        },
        where: {
          id: 'lead_existing',
          isDeleted: false,
          organizationId: 'org_1',
        },
      });
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('logs and swallows a failure instead of throwing', async () => {
      prisma.lead.findFirst.mockRejectedValue(new Error('db down'));

      await expect(
        service.upsertSubscriptionLead({
          organizationId: 'org_1',
          stripeSubscriptionId: 'sub_1',
          tier: SubscriptionTier.PRO,
          userId: 'user_1',
        }),
      ).resolves.toBeUndefined();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to upsert subscription lead'),
        expect.objectContaining({ organizationId: 'org_1' }),
      );
    });
  });
});
