import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import {
  ActivityKey,
  ActivitySource,
  ByokBillingStatus,
  SubscriptionPlan,
  SubscriptionTier,
} from '@genfeedai/enums';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeWebhookSupportService', () => {
  let service: StripeWebhookSupportService;

  const configService = { get: vi.fn().mockReturnValue(undefined) };
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const activitiesService = { create: vi.fn() };
  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn(),
  };
  const organizationSettingsService = {
    findOne: vi.fn(),
    getLatestMajorVersionModelIds: vi.fn().mockResolvedValue(['model_1']),
    patch: vi.fn(),
  };
  const organizationsService = { findOne: vi.fn() };
  const subscriptionsService = { findByStripeCustomerId: vi.fn() };
  const usersService = { findOne: vi.fn(), patch: vi.fn() };
  const requestContextCacheService = { invalidateForUser: vi.fn() };
  const accessBootstrapCacheService = { invalidateForUser: vi.fn() };

  const priceConfig: Record<string, string> = {
    STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'price_enterprise',
    STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'price_pro',
    STRIPE_PRICE_SUBSCRIPTION_PRO_YEARLY: 'price_pro_yearly',
    STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'price_scale',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    organizationSettingsService.getLatestMajorVersionModelIds.mockResolvedValue(
      ['model_1'],
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookSupportService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsService,
        },
        { provide: OrganizationsService, useValue: organizationsService },
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

  describe('addPurchasedCredits', () => {
    it('adds credits with a 1-year expiration', async () => {
      await service.addPurchasedCredits('org_1', 100, 'pay-as-you-go', 'desc');

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
        brand: 'brand_1',
        key: ActivityKey.CREDITS_ADD,
        organization: 'org_1',
        source: ActivitySource.PAY_AS_YOU_GO,
        user: 'user_1',
        value: '100',
      });
    });

    it('omits the user field when none is given', async () => {
      await service.recordCreditsActivity({
        brandId: 'org_1',
        organizationId: 'org_1',
        source: ActivitySource.SUBSCRIPTION,
        value: 'BYOK platform fee paid: $12.50',
      });

      expect(activitiesService.create).toHaveBeenCalledWith({
        brand: 'org_1',
        key: ActivityKey.CREDITS_ADD,
        organization: 'org_1',
        source: ActivitySource.SUBSCRIPTION,
        value: 'BYOK platform fee paid: $12.50',
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
        onboardingStepsCompleted: ['brand', 'plan'],
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
        expect.objectContaining({ customerId: 'cus_123' }),
      );
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
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith('user_1');
      expect(usersService.patch).toHaveBeenCalledWith(
        'user_1',
        expect.objectContaining({ isOnboardingCompleted: true }),
      );
    });

    it('persists the tier through updateOrganizationTierAndModels when given', async () => {
      subscriptionsService.findByStripeCustomerId.mockResolvedValue({
        organization: 'org_1',
        user: 'user_1',
      });
      usersService.findOne.mockResolvedValue({
        id: 'user_1',
        email: 'ada@example.com',
        isOnboardingCompleted: true,
      });
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });

      await service.markOnboardingCompleteFromSession(
        session,
        'test',
        SubscriptionTier.BYOK,
      );

      expect(organizationSettingsService.patch).toHaveBeenCalledWith('os_1', {
        enabledModels: ['model_1'],
        subscriptionTier: SubscriptionTier.BYOK,
      });
    });
  });

  describe('setHasEverHadCredits', () => {
    it('patches the org setting when found', async () => {
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });

      await service.setHasEverHadCredits('org_1', 'test');

      expect(organizationSettingsService.patch).toHaveBeenCalledWith('os_1', {
        hasEverHadCredits: true,
      });
    });

    it('warns instead of throwing when the patch fails', async () => {
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });
      organizationSettingsService.patch.mockRejectedValue(new Error('boom'));

      await service.setHasEverHadCredits('org_1', 'test');

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to set hasEverHadCredits flag'),
        expect.objectContaining({ organizationId: 'org_1' }),
      );
    });
  });

  describe('setByokBillingStatus', () => {
    it('patches the billing status on the org setting', async () => {
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });

      await service.setByokBillingStatus(
        'org_1',
        ByokBillingStatus.ACTIVE,
        'in_1',
        'test',
        'failed to reset byokBillingStatus after payment',
      );

      expect(organizationSettingsService.patch).toHaveBeenCalledWith('os_1', {
        byokBillingStatus: ByokBillingStatus.ACTIVE,
      });
    });

    it('logs patch failures with the caller-provided message', async () => {
      organizationSettingsService.findOne.mockResolvedValue({ id: 'os_1' });
      organizationSettingsService.patch.mockRejectedValue(new Error('boom'));

      await service.setByokBillingStatus(
        'org_1',
        ByokBillingStatus.PAST_DUE,
        'in_1',
        'test',
        'failed to set past_due status after payment failure',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'failed to set past_due status after payment failure',
        ),
        expect.objectContaining({ invoiceId: 'in_1', organizationId: 'org_1' }),
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
    it('maps configured prices to tiers', () => {
      configService.get.mockImplementation((key: string) => priceConfig[key]);

      expect(service.resolveTierFromPriceId('price_pro')).toBe(
        SubscriptionTier.PRO,
      );
      expect(service.resolveTierFromPriceId('price_pro_yearly')).toBe(
        SubscriptionTier.PRO,
      );
      expect(service.resolveTierFromPriceId('price_scale')).toBe(
        SubscriptionTier.SCALE,
      );
      expect(service.resolveTierFromPriceId('price_enterprise')).toBe(
        SubscriptionTier.ENTERPRISE,
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
        enabledModels: ['model_1'],
        subscriptionTier: SubscriptionTier.PRO,
      });
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
});
