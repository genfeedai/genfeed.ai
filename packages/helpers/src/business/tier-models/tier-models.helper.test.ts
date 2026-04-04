import { QualityTier, SubscriptionTier } from '@genfeedai/enums';
import {
  getQualityTiersForSubscription,
  hasQualityAccess,
  TIER_QUALITY_ACCESS,
} from '@helpers/business/tier-models/tier-models.helper';
import { describe, expect, it } from 'vitest';

describe('tier-models.helper', () => {
  describe('TIER_QUALITY_ACCESS', () => {
    it('should give FREE tier only BASIC quality', () => {
      expect(TIER_QUALITY_ACCESS[SubscriptionTier.FREE]).toEqual([
        QualityTier.BASIC,
      ]);
    });

    it('should give BYOK tier only BASIC quality', () => {
      expect(TIER_QUALITY_ACCESS[SubscriptionTier.BYOK]).toEqual([
        QualityTier.BASIC,
      ]);
    });

    it('should give CREATOR tier BASIC and STANDARD', () => {
      expect(TIER_QUALITY_ACCESS[SubscriptionTier.CREATOR]).toEqual([
        QualityTier.BASIC,
        QualityTier.STANDARD,
      ]);
    });

    it('should give PRO tier BASIC, STANDARD, and HIGH', () => {
      expect(TIER_QUALITY_ACCESS[SubscriptionTier.PRO]).toEqual([
        QualityTier.BASIC,
        QualityTier.STANDARD,
        QualityTier.HIGH,
      ]);
    });

    it('should give SCALE tier all quality tiers', () => {
      expect(TIER_QUALITY_ACCESS[SubscriptionTier.SCALE]).toEqual([
        QualityTier.BASIC,
        QualityTier.STANDARD,
        QualityTier.HIGH,
        QualityTier.ULTRA,
      ]);
    });

    it('should give ENTERPRISE tier all quality tiers', () => {
      expect(TIER_QUALITY_ACCESS[SubscriptionTier.ENTERPRISE]).toEqual([
        QualityTier.BASIC,
        QualityTier.STANDARD,
        QualityTier.HIGH,
        QualityTier.ULTRA,
      ]);
    });

    it('should have an entry for every SubscriptionTier', () => {
      const allTiers = Object.values(SubscriptionTier);
      for (const tier of allTiers) {
        expect(TIER_QUALITY_ACCESS[tier]).toBeDefined();
        expect(TIER_QUALITY_ACCESS[tier].length).toBeGreaterThan(0);
      }
    });
  });

  describe('getQualityTiersForSubscription', () => {
    it('should return correct tiers for FREE', () => {
      expect(getQualityTiersForSubscription(SubscriptionTier.FREE)).toEqual([
        QualityTier.BASIC,
      ]);
    });

    it('should return correct tiers for PRO', () => {
      const tiers = getQualityTiersForSubscription(SubscriptionTier.PRO);
      expect(tiers).toContain(QualityTier.BASIC);
      expect(tiers).toContain(QualityTier.STANDARD);
      expect(tiers).toContain(QualityTier.HIGH);
      expect(tiers).not.toContain(QualityTier.ULTRA);
    });

    it('should return correct tiers for ENTERPRISE', () => {
      const tiers = getQualityTiersForSubscription(SubscriptionTier.ENTERPRISE);
      expect(tiers).toHaveLength(4);
    });

    it('should return BASIC for unknown tier', () => {
      const result = getQualityTiersForSubscription(
        'UNKNOWN_TIER' as SubscriptionTier,
      );
      expect(result).toEqual([QualityTier.BASIC]);
    });
  });

  describe('hasQualityAccess', () => {
    it('should return true when tier has access', () => {
      expect(hasQualityAccess(SubscriptionTier.PRO, QualityTier.HIGH)).toBe(
        true,
      );
    });

    it('should return false when tier lacks access', () => {
      expect(hasQualityAccess(SubscriptionTier.FREE, QualityTier.ULTRA)).toBe(
        false,
      );
    });

    it('should return true for BASIC on all tiers', () => {
      const allTiers = Object.values(SubscriptionTier);
      for (const tier of allTiers) {
        expect(hasQualityAccess(tier, QualityTier.BASIC)).toBe(true);
      }
    });

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
      expect(
        hasQualityAccess(SubscriptionTier.CREATOR, QualityTier.ULTRA),
      ).toBe(false);
    });

    it('should return false for unknown subscription tier', () => {
      expect(
        hasQualityAccess('UNKNOWN' as SubscriptionTier, QualityTier.BASIC),
      ).toBe(false);
    });
  });
});
