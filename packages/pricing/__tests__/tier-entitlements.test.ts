import { SubscriptionTier } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  FREE_SEAT_LIMIT,
  getApiEntitlementForTier,
  getApiRateLimitForTier,
  getBrandLimitForTier,
  getChannelLimitForTier,
  getOrganizationLimitForTier,
  getPlanEntitlementForTier,
  getSeatLimitForTier,
  getUpgradeTierForLimit,
  HIGHER_API_RATE_LIMIT,
  hasApiAccess,
  hasTrainingAccess,
  PLAN_LIMIT_UNLIMITED,
  SCALE_API_RATE_LIMIT,
  SINGLE_ORGANIZATION_LIMIT,
  TIER_API_ENTITLEMENTS,
  TIER_PLAN_ENTITLEMENTS,
} from '../src/tier-entitlements';

describe('TIER_PLAN_ENTITLEMENTS', () => {
  it('covers every SubscriptionTier', () => {
    for (const tier of Object.values(SubscriptionTier)) {
      expect(TIER_PLAN_ENTITLEMENTS[tier]).toBeDefined();
    }
  });

  it('projects the API-only view consistently', () => {
    for (const tier of Object.values(SubscriptionTier)) {
      expect(TIER_API_ENTITLEMENTS[tier]).toEqual({
        apiAccess: TIER_PLAN_ENTITLEMENTS[tier].apiAccess,
        apiRateLimit: TIER_PLAN_ENTITLEMENTS[tier].apiRateLimit,
      });
    }
  });
});

describe('getPlanEntitlementForTier', () => {
  it('falls back to FREE for null, undefined, empty, and unknown tiers', () => {
    const free = TIER_PLAN_ENTITLEMENTS[SubscriptionTier.FREE];

    expect(getPlanEntitlementForTier(null)).toBe(free);
    expect(getPlanEntitlementForTier(undefined)).toBe(free);
    expect(getPlanEntitlementForTier('')).toBe(free);
    expect(getPlanEntitlementForTier('mystery-tier')).toBe(free);
  });

  it('resolves known tiers from the raw stored string', () => {
    expect(getPlanEntitlementForTier(SubscriptionTier.SCALE)).toBe(
      TIER_PLAN_ENTITLEMENTS[SubscriptionTier.SCALE],
    );
  });
});

describe('API entitlements', () => {
  it('denies API access to free tiers', () => {
    expect(hasApiAccess(SubscriptionTier.FREE)).toBe(false);
    expect(hasApiAccess(SubscriptionTier.BYOK)).toBe(false);
    expect(hasApiAccess(null)).toBe(false);
  });

  it('grants API access from Pro upward', () => {
    expect(hasApiAccess(SubscriptionTier.PRO)).toBe(true);
    expect(hasApiAccess(SubscriptionTier.SCALE)).toBe(true);
    expect(hasApiAccess(SubscriptionTier.ENTERPRISE)).toBe(true);
  });

  it('returns per-tier rate limits', () => {
    expect(getApiRateLimitForTier(SubscriptionTier.FREE)).toBe(0);
    expect(getApiRateLimitForTier(SubscriptionTier.PRO)).toBe(
      HIGHER_API_RATE_LIMIT,
    );
    expect(getApiRateLimitForTier(SubscriptionTier.SCALE)).toBe(
      SCALE_API_RATE_LIMIT,
    );
    expect(getApiRateLimitForTier(SubscriptionTier.ENTERPRISE)).toBeNull();
  });

  it('projects only API fields through getApiEntitlementForTier', () => {
    expect(getApiEntitlementForTier(SubscriptionTier.PRO)).toEqual({
      apiAccess: true,
      apiRateLimit: HIGHER_API_RATE_LIMIT,
    });
  });
});

describe('product limits', () => {
  it('keeps brands and channels unlimited on every tier', () => {
    for (const tier of Object.values(SubscriptionTier)) {
      expect(getBrandLimitForTier(tier)).toBe(PLAN_LIMIT_UNLIMITED);
      expect(getChannelLimitForTier(tier)).toBe(PLAN_LIMIT_UNLIMITED);
    }
  });

  it('caps seats on free tiers and lifts the cap from Pro upward', () => {
    expect(getSeatLimitForTier(SubscriptionTier.FREE)).toBe(FREE_SEAT_LIMIT);
    expect(getSeatLimitForTier(SubscriptionTier.BYOK)).toBe(FREE_SEAT_LIMIT);
    expect(getSeatLimitForTier(SubscriptionTier.PRO)).toBe(
      PLAN_LIMIT_UNLIMITED,
    );
  });

  it('caps organizations below Scale', () => {
    expect(getOrganizationLimitForTier(SubscriptionTier.FREE)).toBe(
      SINGLE_ORGANIZATION_LIMIT,
    );
    expect(getOrganizationLimitForTier(SubscriptionTier.PRO)).toBe(
      SINGLE_ORGANIZATION_LIMIT,
    );
    expect(getOrganizationLimitForTier(SubscriptionTier.SCALE)).toBe(
      PLAN_LIMIT_UNLIMITED,
    );
    expect(getOrganizationLimitForTier(SubscriptionTier.ENTERPRISE)).toBe(
      PLAN_LIMIT_UNLIMITED,
    );
  });
});

describe('hasTrainingAccess', () => {
  it('is denied on free tiers and unknown tiers', () => {
    expect(hasTrainingAccess(SubscriptionTier.FREE)).toBe(false);
    expect(hasTrainingAccess(SubscriptionTier.BYOK)).toBe(false);
    expect(hasTrainingAccess('unknown')).toBe(false);
  });

  it('is granted from Pro upward', () => {
    expect(hasTrainingAccess(SubscriptionTier.PRO)).toBe(true);
    expect(hasTrainingAccess(SubscriptionTier.SCALE)).toBe(true);
    expect(hasTrainingAccess(SubscriptionTier.ENTERPRISE)).toBe(true);
  });
});

describe('getUpgradeTierForLimit', () => {
  it('suggests Pro when seats are capped', () => {
    expect(getUpgradeTierForLimit('seats', SubscriptionTier.FREE)).toBe(
      SubscriptionTier.PRO,
    );
    expect(getUpgradeTierForLimit('seats', SubscriptionTier.BYOK)).toBe(
      SubscriptionTier.PRO,
    );
    expect(getUpgradeTierForLimit('seats', null)).toBe(SubscriptionTier.PRO);
    expect(getUpgradeTierForLimit('seats', 'unknown')).toBe(
      SubscriptionTier.PRO,
    );
  });

  it('suggests nothing for seats from Pro upward', () => {
    expect(getUpgradeTierForLimit('seats', SubscriptionTier.PRO)).toBeNull();
    expect(getUpgradeTierForLimit('seats', SubscriptionTier.SCALE)).toBeNull();
    expect(
      getUpgradeTierForLimit('seats', SubscriptionTier.ENTERPRISE),
    ).toBeNull();
  });

  it('suggests Scale when organizations are capped', () => {
    expect(getUpgradeTierForLimit('organizations', SubscriptionTier.FREE)).toBe(
      SubscriptionTier.SCALE,
    );
    expect(getUpgradeTierForLimit('organizations', SubscriptionTier.PRO)).toBe(
      SubscriptionTier.SCALE,
    );
    expect(
      getUpgradeTierForLimit('organizations', SubscriptionTier.SCALE),
    ).toBeNull();
    expect(
      getUpgradeTierForLimit('organizations', SubscriptionTier.ENTERPRISE),
    ).toBeNull();
  });

  it('suggests nothing for resources that are never capped', () => {
    expect(getUpgradeTierForLimit('brands', SubscriptionTier.FREE)).toBeNull();
    expect(
      getUpgradeTierForLimit('channels', SubscriptionTier.FREE),
    ).toBeNull();
  });
});
