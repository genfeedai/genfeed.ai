import { QualityTier, SubscriptionTier } from '@genfeedai/contracts';
import {
  getQualityTiersForSubscription,
  hasQualityAccess,
  TIER_QUALITY_ACCESS,
} from '@helpers/business/tier-models/tier-models.helper';
import { describe, expect, it } from 'vitest';

describe('tier-models.helper', () => {
  describe('TIER_QUALITY_ACCESS', () => {
    it('should have an entry for every SubscriptionTier', () => {
      const allTiers = Object.values(SubscriptionTier);
      for (const tier of allTiers) {
        expect(TIER_QUALITY_ACCESS[tier]).toBeDefined();
        expect(TIER_QUALITY_ACCESS[tier].length).toBeGreaterThan(0);
      }
    });
  });

  describe('getQualityTiersForSubscription', () => {
    it('should return correct tiers for PRO', () => {
      const tiers = getQualityTiersForSubscription(SubscriptionTier.PRO);
      expect(tiers).toContain(QualityTier.BASIC);
      expect(tiers).toContain(QualityTier.STANDARD);
      expect(tiers).toContain(QualityTier.HIGH);
      expect(tiers).not.toContain(QualityTier.ULTRA);
    });
  });

  describe('hasQualityAccess', () => {
    it('should return true for ULTRA on SCALE and ENTERPRISE only', () => {
      expect(hasQualityAccess(SubscriptionTier.SCALE, QualityTier.ULTRA)).toBe(
        true,
      );
      expect(
        hasQualityAccess(SubscriptionTier.ENTERPRISE, QualityTier.ULTRA),
      ).toBe(true);
      expect(hasQualityAccess(SubscriptionTier.PRO, QualityTier.ULTRA)).toBe(
        false,
      );
    });

    it('should return false for unknown subscription tier', () => {
      expect(
        hasQualityAccess('UNKNOWN' as SubscriptionTier, QualityTier.BASIC),
      ).toBe(false);
    });
  });
});
