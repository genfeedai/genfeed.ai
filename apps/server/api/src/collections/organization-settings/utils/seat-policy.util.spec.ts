import { SubscriptionTier } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FREE_SEATS,
  isUnlimitedSeatTier,
  resolveEffectiveSeatsLimit,
  SEATS_UNLIMITED,
  UNLIMITED_SEATS_FAIR_USE_CEILING,
} from './seat-policy.util';

describe('seat-policy.util', () => {
  describe('isUnlimitedSeatTier', () => {
    it('is true for every paid tier: Pro, Scale, and Enterprise', () => {
      expect(isUnlimitedSeatTier(SubscriptionTier.PRO)).toBe(true);
      expect(isUnlimitedSeatTier(SubscriptionTier.SCALE)).toBe(true);
      expect(isUnlimitedSeatTier(SubscriptionTier.ENTERPRISE)).toBe(true);
    });

    it('is false for free/byok tiers (solo workspace)', () => {
      expect(isUnlimitedSeatTier(SubscriptionTier.FREE)).toBe(false);
      expect(isUnlimitedSeatTier(SubscriptionTier.BYOK)).toBe(false);
    });

    it('is false for undefined/null/unknown tiers', () => {
      expect(isUnlimitedSeatTier(undefined)).toBe(false);
      expect(isUnlimitedSeatTier(null)).toBe(false);
      expect(isUnlimitedSeatTier('mystery')).toBe(false);
    });
  });

  describe('resolveEffectiveSeatsLimit', () => {
    it('returns unlimited (null) for Pro regardless of stored limit', () => {
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.PRO, 1)).toBe(
        SEATS_UNLIMITED,
      );
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.PRO, 3)).toBeNull();
    });

    it('returns unlimited (null) for Scale regardless of stored limit', () => {
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.SCALE, 3)).toBe(
        SEATS_UNLIMITED,
      );
      // Even a stale stored cap must not gate an unlimited tier.
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.SCALE, 1)).toBeNull();
    });

    it('returns unlimited (null) for Enterprise regardless of stored limit', () => {
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.ENTERPRISE, 3)).toBe(
        SEATS_UNLIMITED,
      );
      expect(
        resolveEffectiveSeatsLimit(SubscriptionTier.ENTERPRISE, 999),
      ).toBeNull();
    });

    it('honors the stored fair-use limit for finite tiers (FREE/BYOK)', () => {
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.FREE, 1)).toBe(1);
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.BYOK, 1)).toBe(1);
      // Admin-raised override is preserved.
      expect(resolveEffectiveSeatsLimit(SubscriptionTier.FREE, 25)).toBe(25);
    });

    it('falls back to DEFAULT_FREE_SEATS when no tier and no stored limit', () => {
      expect(resolveEffectiveSeatsLimit(undefined, undefined)).toBe(
        DEFAULT_FREE_SEATS,
      );
      expect(resolveEffectiveSeatsLimit(null, null)).toBe(DEFAULT_FREE_SEATS);
    });

    it('keeps a finite stored limit for an undefined tier (legacy orgs)', () => {
      expect(resolveEffectiveSeatsLimit(undefined, 4)).toBe(4);
    });
  });

  describe('constants', () => {
    it('exposes a solo default of 1 free seat', () => {
      expect(DEFAULT_FREE_SEATS).toBe(1);
    });

    it('exposes a high, non-billing fair-use ceiling', () => {
      expect(UNLIMITED_SEATS_FAIR_USE_CEILING).toBeGreaterThan(
        DEFAULT_FREE_SEATS,
      );
      expect(UNLIMITED_SEATS_FAIR_USE_CEILING).toBeGreaterThanOrEqual(1000);
    });
  });
});
