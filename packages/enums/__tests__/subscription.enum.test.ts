import { describe, expect, it } from 'vitest';
import {
  ByokBillingStatus,
  SubscriptionCategory,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
} from '../src/subscription.enum';

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
    it('should have 6 members', () => {
      expect(Object.values(SubscriptionTier)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(SubscriptionTier.FREE).toBe('free');
      expect(SubscriptionTier.BYOK).toBe('byok');
      expect(SubscriptionTier.CREATOR).toBe('creator');
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
      expect(ByokBillingStatus.ACTIVE).toBe('active');
      expect(ByokBillingStatus.PAST_DUE).toBe('past_due');
      expect(ByokBillingStatus.SUSPENDED).toBe('suspended');
    });
  });

  describe('SubscriptionStatus', () => {
    it('should have 8 members', () => {
      expect(Object.values(SubscriptionStatus)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(SubscriptionStatus.ACTIVE).toBe('active');
      expect(SubscriptionStatus.TRIALING).toBe('trialing');
      expect(SubscriptionStatus.PAST_DUE).toBe('past-due');
      expect(SubscriptionStatus.CANCELED).toBe('canceled');
      expect(SubscriptionStatus.INCOMPLETE).toBe('incomplete');
      expect(SubscriptionStatus.INCOMPLETE_EXPIRED).toBe('incomplete-expired');
      expect(SubscriptionStatus.UNPAID).toBe('unpaid');
      expect(SubscriptionStatus.PAUSED).toBe('paused');
    });
  });
});
