import { SubscriptionTier } from '@genfeedai/enums';
import {
  getApiEntitlementForTier,
  getApiRateLimitForTier,
  HIGHER_API_RATE_LIMIT,
  hasApiAccess,
  SCALE_API_RATE_LIMIT,
  STANDARD_API_RATE_LIMIT,
  TIER_API_ENTITLEMENTS,
} from '@genfeedai/pricing';

/**
 * Canonical tier → API entitlement mapping (Model B). Lives in
 * @genfeedai/pricing; exercised here so `bun run test --filter=@genfeedai/api`
 * covers the mapping and its consumers together.
 */
describe('tier API entitlements', () => {
  it('covers every SubscriptionTier (exhaustive map)', () => {
    for (const tier of Object.values(SubscriptionTier)) {
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
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.CREATOR]).toEqual({
      apiAccess: true,
      apiRateLimit: STANDARD_API_RATE_LIMIT,
    });
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.PRO]).toEqual({
      apiAccess: true,
      apiRateLimit: HIGHER_API_RATE_LIMIT,
    });
    expect(TIER_API_ENTITLEMENTS[SubscriptionTier.SCALE]).toEqual({
      apiAccess: true,
      apiRateLimit: SCALE_API_RATE_LIMIT,
    });

    for (const tier of [
      SubscriptionTier.CREATOR,
      SubscriptionTier.PRO,
      SubscriptionTier.SCALE,
    ]) {
      expect(hasApiAccess(tier)).toBe(true);
    }
  });

  it('escalates the rate limit across paid tiers', () => {
    expect(STANDARD_API_RATE_LIMIT).toBeLessThan(HIGHER_API_RATE_LIMIT);
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

  it('exposes per-tier rate limits via getApiRateLimitForTier', () => {
    expect(getApiRateLimitForTier(SubscriptionTier.FREE)).toBe(0);
    expect(getApiRateLimitForTier(SubscriptionTier.CREATOR)).toBe(
      STANDARD_API_RATE_LIMIT,
    );
    expect(getApiRateLimitForTier(SubscriptionTier.PRO)).toBe(
      HIGHER_API_RATE_LIMIT,
    );
    expect(getApiRateLimitForTier(SubscriptionTier.SCALE)).toBe(
      SCALE_API_RATE_LIMIT,
    );
  });
});
