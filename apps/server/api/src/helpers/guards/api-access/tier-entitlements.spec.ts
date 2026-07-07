import { SubscriptionTier } from '@genfeedai/enums';
import {
  FREE_SEAT_LIMIT,
  getApiEntitlementForTier,
  getApiRateLimitForTier,
  getBrandLimitForTier,
  getChannelLimitForTier,
  getPlanEntitlementForTier,
  getSeatLimitForTier,
  getUpgradeTierForLimit,
  HIGHER_API_RATE_LIMIT,
  hasApiAccess,
  PLAN_LIMIT_UNLIMITED,
  SCALE_API_RATE_LIMIT,
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

  it('denies API access to free tiers (PAYG, BYOK)', () => {
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.FREE]).toEqual({
      apiAccess: false,
      apiRateLimit: 0,
    });
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.BYOK]).toEqual({
      apiAccess: false,
      apiRateLimit: 0,
    });
    expect(hasApiAccess(SubscriptionTier.FREE)).toBe(false);
    expect(hasApiAccess(SubscriptionTier.BYOK)).toBe(false);
  });

  it('grants API access with escalating limits to paid tiers', () => {
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.PRO]).toEqual({
      apiAccess: true,
      apiRateLimit: HIGHER_API_RATE_LIMIT,
    });
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.SCALE]).toEqual({
      apiAccess: true,
      apiRateLimit: SCALE_API_RATE_LIMIT,
    });

    for (const tier of [SubscriptionTier.PRO, SubscriptionTier.SCALE]) {
      expect(hasApiAccess(tier)).toBe(true);
    }
  });

  it('escalates the rate limit across paid tiers', () => {
    expect(HIGHER_API_RATE_LIMIT).toBeLessThan(SCALE_API_RATE_LIMIT);
  });

  it('gives Enterprise API access with no platform-enforced ceiling', () => {
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.ENTERPRISE]).toEqual({
      apiAccess: true,
      apiRateLimit: null,
    });
    expect(hasApiAccess(SubscriptionTier.ENTERPRISE)).toBe(true);
    expect(getApiRateLimitForTier(SubscriptionTier.ENTERPRISE)).toBeNull();
  });

  it('default-denies unknown/empty tiers', () => {
    for (const tier of ['', 'bogus', null, undefined]) {
      expect(hasApiAccess(tier)).toBe(false);
      expect(getApiEntitlementForTier(tier)).toEqual({
        apiAccess: false,
        apiRateLimit: 0,
      });
    }
  });

  it('resolves PAYG/BYOK product limits from the pricing package', () => {
    for (const tier of [SubscriptionTier.FREE, SubscriptionTier.BYOK]) {
      expect(getBrandLimitForTier(tier)).toBeNull();
      expect(getChannelLimitForTier(tier)).toBeNull();
      expect(getSeatLimitForTier(tier)).toBe(FREE_SEAT_LIMIT);
    }
  });

  it('resolves paid tier product limits: unlimited seats, brands, and channels', () => {
    expect(getPlanEntitlementForTier(SubscriptionTier.PRO)).toMatchObject({
      brandLimit: PLAN_LIMIT_UNLIMITED,
      channelLimit: PLAN_LIMIT_UNLIMITED,
      seatLimit: PLAN_LIMIT_UNLIMITED,
    });

    for (const tier of [SubscriptionTier.SCALE, SubscriptionTier.ENTERPRISE]) {
      expect(getBrandLimitForTier(tier)).toBeNull();
      expect(getChannelLimitForTier(tier)).toBeNull();
      expect(getSeatLimitForTier(tier)).toBeNull();
    }
  });

  it('uses PAYG/free limits for empty or unknown tiers', () => {
    for (const tier of ['', 'bogus', null, undefined]) {
      expect(getBrandLimitForTier(tier)).toBeNull();
      expect(getChannelLimitForTier(tier)).toBeNull();
      expect(getSeatLimitForTier(tier)).toBe(FREE_SEAT_LIMIT);
    }
  });

  it('names the next tier only for finite product limits', () => {
    expect(getUpgradeTierForLimit('brands', SubscriptionTier.FREE)).toBe(null);
    expect(getUpgradeTierForLimit('seats', SubscriptionTier.BYOK)).toBe(
      SubscriptionTier.PRO,
    );
    expect(getUpgradeTierForLimit('channels', SubscriptionTier.FREE)).toBe(
      null,
    );
    expect(getUpgradeTierForLimit('channels', SubscriptionTier.PRO)).toBe(null);
    expect(getUpgradeTierForLimit('channels', SubscriptionTier.SCALE)).toBe(
      null,
    );
  });

  it('exposes per-tier rate limits via getApiRateLimitForTier', () => {
    expect(getApiRateLimitForTier(SubscriptionTier.FREE)).toBe(0);
    expect(getApiRateLimitForTier(SubscriptionTier.BYOK)).toBe(0);
    expect(getApiRateLimitForTier(SubscriptionTier.PRO)).toBe(300);
    expect(getApiRateLimitForTier(SubscriptionTier.SCALE)).toBe(600);
    expect(getApiRateLimitForTier(SubscriptionTier.ENTERPRISE)).toBeNull();
  });
});
