import { SubscriptionAttributionsController } from '@api/collections/subscription-attributions/controllers/subscription-attributions.controller';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { SubscriptionsController } from '@api/collections/subscriptions/controllers/subscriptions.controller';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  resetLicenseVerificationForTests,
  setLicenseVerificationVerdictForTests,
} from '@genfeedai/config/license-server';
import {
  SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
  SUBSCRIPTIONS_SERVICE,
  USER_SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  billingControllers,
  subscriptionAttributionsServiceProvider,
  subscriptionsServiceProvider,
  userSubscriptionsServiceProvider,
} from './billing.providers';
import { OssSubscriptionAttributionsService } from './oss-subscription-attributions.service';
import { OssSubscriptionsService } from './oss-subscriptions.service';
import { OssUserSubscriptionsService } from './oss-user-subscriptions.service';

function stubCommunityEnv(): void {
  vi.stubEnv('GENFEED_CLOUD', '');
  vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
  vi.stubEnv('GENFEED_LICENSE_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', '');
  vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.example.com');
}

/**
 * The runtime billing gate: SaaS and community images ship the same billing
 * code, and `hasOrganizationBilling()` decides at boot which implementation
 * each shared string token resolves to and whether the billing routes exist.
 */
describe('billing.providers runtime gate', () => {
  beforeEach(() => {
    resetLicenseVerificationForTests();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetLicenseVerificationForTests();
    vi.unstubAllEnvs();
  });

  describe('community self-host (no cloud flag, no license)', () => {
    beforeEach(() => {
      stubCommunityEnv();
    });

    it('binds every billing token to its community stub', async () => {
      expect(hasOrganizationBilling()).toBe(false);

      const module = await Test.createTestingModule({
        providers: [
          subscriptionsServiceProvider(),
          userSubscriptionsServiceProvider(),
          subscriptionAttributionsServiceProvider(),
        ],
      }).compile();

      expect(module.get(SUBSCRIPTIONS_SERVICE)).toBeInstanceOf(
        OssSubscriptionsService,
      );
      expect(module.get(USER_SUBSCRIPTIONS_SERVICE)).toBeInstanceOf(
        OssUserSubscriptionsService,
      );
      expect(module.get(SUBSCRIPTION_ATTRIBUTIONS_SERVICE)).toBeInstanceOf(
        OssSubscriptionAttributionsService,
      );
    });

    it('registers no billing controllers', () => {
      expect(billingControllers([SubscriptionsController])).toEqual([]);
      expect(billingControllers([SubscriptionAttributionsController])).toEqual(
        [],
      );
    });
  });

  describe('SaaS cloud (GENFEED_CLOUD=true, no license key)', () => {
    beforeEach(() => {
      vi.stubEnv('GENFEED_CLOUD', 'true');
      vi.stubEnv('GENFEED_LICENSE_KEY', '');
    });

    it('binds every billing token to the real Stripe-backed service', () => {
      expect(hasOrganizationBilling()).toBe(true);

      expect(subscriptionsServiceProvider()).toEqual({
        provide: SUBSCRIPTIONS_SERVICE,
        useExisting: SubscriptionsService,
      });
      expect(userSubscriptionsServiceProvider()).toEqual({
        provide: USER_SUBSCRIPTIONS_SERVICE,
        useExisting: UserSubscriptionsService,
      });
      expect(subscriptionAttributionsServiceProvider()).toEqual({
        provide: SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
        useExisting: SubscriptionAttributionsService,
      });
    });

    it('registers the billing controllers', () => {
      expect(billingControllers([SubscriptionsController])).toEqual([
        SubscriptionsController,
      ]);
      expect(billingControllers([SubscriptionAttributionsController])).toEqual([
        SubscriptionAttributionsController,
      ]);
    });
  });

  describe('licensed self-host', () => {
    beforeEach(() => {
      stubCommunityEnv();
      setLicenseVerificationVerdictForTests(true);
    });

    it('binds the real services and registers the controllers', () => {
      expect(hasOrganizationBilling()).toBe(true);
      expect(subscriptionsServiceProvider()).toEqual({
        provide: SUBSCRIPTIONS_SERVICE,
        useExisting: SubscriptionsService,
      });
      expect(billingControllers([SubscriptionsController])).toEqual([
        SubscriptionsController,
      ]);
    });
  });
});
