import { SubscriptionTier } from '@genfeedai/contracts';
import {
  FREE_API_RATE_LIMIT,
  FREE_SEAT_LIMIT,
  getApiEntitlementForTier,
  getApiRateLimitForTier,
  getBrandLimitForTier,
  getChannelLimitForTier,
  getOrganizationLimitForTier,
  getSeatLimitForTier,
  getUpgradeTierForLimit,
  hasApiAccess,
  hasCleanExportAccess,
  hasTrainingAccess,
  SCALE_API_RATE_LIMIT,
  SINGLE_ORGANIZATION_LIMIT,
  TIER_API_ENTITLEMENTS,
  TIER_PLAN_ENTITLEMENTS,
} from '@genfeedai/pricing';

/**
 * Canonical tier → API entitlement mapping (Model B). Lives in
 * @genfeedai/pricing; exercised here so `bun run test --filter=@genfeedai/api`
 * covers the mapping and its consumers together.
 */
describe('tier API entitlements', () => {
  it('covers every SubscriptionTier (exhaustive map)', () => {
    for (const tier of Object.values(SubscriptionTier)) {
      expect(TIER_PLAN_ENTITLEMENTS[tier]).toBeDefined();
      expect(TIER_API_ENTITLEMENTS[tier]).toBeDefined();
    }
  });

  it('gives the free tier rate-limited API access', () => {
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.FREE]).toEqual({
      apiAccess: true,
      apiRateLimit: FREE_API_RATE_LIMIT,
    });
    expect(hasApiAccess(SubscriptionTier.FREE)).toBe(true);
  });

  it('denies training access to free tiers and grants Scale+', () => {
    expect(hasTrainingAccess(SubscriptionTier.FREE)).toBe(false);
    expect(hasTrainingAccess(SubscriptionTier.SCALE)).toBe(true);
    expect(hasTrainingAccess(SubscriptionTier.ENTERPRISE)).toBe(true);
  });

  it('denies clean-export access to free tiers and grants Scale+ (SaaS gate for #4498)', () => {
    expect(hasCleanExportAccess(SubscriptionTier.FREE)).toBe(false);
    expect(hasCleanExportAccess(SubscriptionTier.SCALE)).toBe(true);
    expect(hasCleanExportAccess(SubscriptionTier.ENTERPRISE)).toBe(true);
  });

  it('grants API access with escalating limits to paid tiers', () => {
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.SCALE]).toEqual({
      apiAccess: true,
      apiRateLimit: SCALE_API_RATE_LIMIT,
    });

    for (const tier of [SubscriptionTier.SCALE]) {
      expect(hasApiAccess(tier)).toBe(true);
    }
  });

  it('gives Enterprise API access with no platform-enforced ceiling', () => {
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.ENTERPRISE]).toEqual({
      apiAccess: true,
      apiRateLimit: null,
    });
    expect(hasApiAccess(SubscriptionTier.ENTERPRISE)).toBe(true);
    expect(getApiRateLimitForTier(SubscriptionTier.ENTERPRISE)).toBeNull();
  });

  it('gives unknown/empty tiers the free tier entitlement', () => {
    for (const tier of ['', 'bogus', null, undefined]) {
      expect(hasApiAccess(tier)).toBe(true);
      expect(getApiEntitlementForTier(tier)).toEqual({
        apiAccess: true,
        apiRateLimit: FREE_API_RATE_LIMIT,
      });
    }
  });

  it('resolves PAYG product limits from the pricing package', () => {
    for (const tier of [SubscriptionTier.FREE]) {
      expect(getBrandLimitForTier(tier)).toBeNull();
      expect(getChannelLimitForTier(tier)).toBeNull();
      expect(getOrganizationLimitForTier(tier)).toBe(SINGLE_ORGANIZATION_LIMIT);
      expect(getSeatLimitForTier(tier)).toBe(FREE_SEAT_LIMIT);
    }
  });

  it('resolves Scale+ product limits: unlimited seats, brands, channels, and organizations', () => {
    for (const tier of [SubscriptionTier.SCALE, SubscriptionTier.ENTERPRISE]) {
      expect(getBrandLimitForTier(tier)).toBeNull();
      expect(getChannelLimitForTier(tier)).toBeNull();
      expect(getOrganizationLimitForTier(tier)).toBeNull();
      expect(getSeatLimitForTier(tier)).toBeNull();
    }
  });

  it('uses PAYG/free limits for empty or unknown tiers', () => {
    for (const tier of ['', 'bogus', null, undefined]) {
      expect(getBrandLimitForTier(tier)).toBeNull();
      expect(getChannelLimitForTier(tier)).toBeNull();
      expect(getOrganizationLimitForTier(tier)).toBe(SINGLE_ORGANIZATION_LIMIT);
      expect(getSeatLimitForTier(tier)).toBe(FREE_SEAT_LIMIT);
    }
  });

  it('names the next tier only for finite product limits', () => {
    expect(getUpgradeTierForLimit('brands', SubscriptionTier.FREE)).toBe(null);
    expect(getUpgradeTierForLimit('seats', SubscriptionTier.FREE)).toBe(
      SubscriptionTier.SCALE,
    );
    expect(getUpgradeTierForLimit('organizations', SubscriptionTier.FREE)).toBe(
      SubscriptionTier.SCALE,
    );
    expect(
      getUpgradeTierForLimit('organizations', SubscriptionTier.SCALE),
    ).toBe(null);
    expect(getUpgradeTierForLimit('channels', SubscriptionTier.FREE)).toBe(
      null,
    );
    expect(getUpgradeTierForLimit('channels', SubscriptionTier.SCALE)).toBe(
      null,
    );
  });

  it('exposes per-tier rate limits via getApiRateLimitForTier', () => {
    expect(getApiRateLimitForTier(SubscriptionTier.FREE)).toBe(
      FREE_API_RATE_LIMIT,
    );
    expect(getApiRateLimitForTier(SubscriptionTier.SCALE)).toBe(600);
    expect(getApiRateLimitForTier(SubscriptionTier.ENTERPRISE)).toBeNull();
  });
});
