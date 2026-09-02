import { describe, expect, it } from 'vitest';
import {
  ByokBillingStatus,
  SubscriptionCategory,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
  subscriptionStatusFromStripe,
  toPrismaSubscriptionStatus,
} from '../../src/enums/subscription.enum';

describe('subscription.enum', () => {
  describe('SubscriptionCategory', () => {
    it('should have 2 members', () => {
      expect(Object.values(SubscriptionCategory)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(SubscriptionCategory.MONTHLY).toBe('monthly');
      expect(SubscriptionCategory.PAYG).toBe('payg');
    });
  });

  describe('SubscriptionPlan', () => {
    it('should have 4 members', () => {
      expect(Object.values(SubscriptionPlan)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(SubscriptionPlan.MONTHLY).toBe('monthly');
      expect(SubscriptionPlan.YEARLY).toBe('yearly');
      expect(SubscriptionPlan.PAYG).toBe('payg');
      expect(SubscriptionPlan.ENTERPRISE).toBe('enterprise');
    });
  });

  describe('SubscriptionTier', () => {
    it('should have 5 members', () => {
      expect(Object.values(SubscriptionTier)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(SubscriptionTier.FREE).toBe('free');
      expect(SubscriptionTier.BYOK).toBe('byok');
      expect(SubscriptionTier.PRO).toBe('pro');
      expect(SubscriptionTier.SCALE).toBe('scale');
      expect(SubscriptionTier.ENTERPRISE).toBe('enterprise');
    });
  });

  describe('ByokBillingStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(ByokBillingStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ByokBillingStatus.ACTIVE).toBe('ACTIVE');
      expect(ByokBillingStatus.PAST_DUE).toBe('PAST_DUE');
      expect(ByokBillingStatus.SUSPENDED).toBe('SUSPENDED');
    });
  });

  describe('SubscriptionStatus', () => {
    it('should include Prisma labels plus Stripe domain-only states', () => {
      expect(new Set(Object.values(SubscriptionStatus))).toEqual(
        new Set([
          'ACTIVE',
          'CANCELLED',
          'PAST_DUE',
          'TRIALING',
          'INCOMPLETE',
          'INCOMPLETE_EXPIRED',
          'UNPAID',
          'PAUSED',
        ]),
      );
    });

    it('should match Prisma SCREAMING_SNAKE for persisted members', () => {
      expect(SubscriptionStatus.ACTIVE).toBe('ACTIVE');
      expect(SubscriptionStatus.TRIALING).toBe('TRIALING');
      expect(SubscriptionStatus.PAST_DUE).toBe('PAST_DUE');
      expect(SubscriptionStatus.CANCELLED).toBe('CANCELLED');
      expect(SubscriptionStatus.INCOMPLETE).toBe('INCOMPLETE');
      expect(SubscriptionStatus.INCOMPLETE_EXPIRED).toBe('INCOMPLETE_EXPIRED');
      expect(SubscriptionStatus.UNPAID).toBe('UNPAID');
      expect(SubscriptionStatus.PAUSED).toBe('PAUSED');
    });

    it('maps Stripe canceled US spelling to CANCELLED', () => {
      expect(subscriptionStatusFromStripe('canceled')).toBe(
        SubscriptionStatus.CANCELLED,
      );
      expect(subscriptionStatusFromStripe('cancelled')).toBe(
        SubscriptionStatus.CANCELLED,
      );
      expect(subscriptionStatusFromStripe('active')).toBe(
        SubscriptionStatus.ACTIVE,
      );
      expect(subscriptionStatusFromStripe('past-due')).toBe(
        SubscriptionStatus.PAST_DUE,
      );
      expect(subscriptionStatusFromStripe('past_due')).toBe(
        SubscriptionStatus.PAST_DUE,
      );
    });

    it('collapses Stripe-only states onto Prisma labels for writes', () => {
      expect(toPrismaSubscriptionStatus('unpaid')).toBe(
        SubscriptionStatus.PAST_DUE,
      );
      expect(toPrismaSubscriptionStatus('paused')).toBe(
        SubscriptionStatus.CANCELLED,
      );
      expect(toPrismaSubscriptionStatus('incomplete_expired')).toBe(
        SubscriptionStatus.INCOMPLETE,
      );
      expect(toPrismaSubscriptionStatus('active')).toBe(
        SubscriptionStatus.ACTIVE,
      );
    });
  });
});
