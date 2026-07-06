/**
 * Per-tier API entitlements — the canonical source of truth for the
 * "Model B" API-access promise: every PAID plan advertises API access at the
 * same credit price, differentiated by rate limits.
 *
 *   Marketing plan (plans-pricing.ts)      → SubscriptionTier   → API access
 *   ─────────────────────────────────────────────────────────────────────────
 *   Pay As You Go (free)                   → FREE               → none
 *   BYOK (free, bring-your-own-key)        → BYOK               → none
 *   Pro                        ($49/mo)    → PRO                → higher limit
 *   Scale                      ($499/mo)   → SCALE              → highest fixed
 *   Enterprise                 (custom)    → ENTERPRISE         → custom / SLA
 *
 * Enforcement lives in the API:
 *   - issuance gate:  apps/server/api/src/helpers/guards/api-access/api-access.guard.ts
 *   - rate limiting:  apps/server/api/src/collections/api-keys/services/api-keys.service.ts
 *
 * The map is keyed on the canonical runtime enum `SubscriptionTier`
 * (@genfeedai/enums) — the same value persisted on
 * `OrganizationSetting.subscriptionTier` — so no tier can be silently missed
 * (the `Record<SubscriptionTier, …>` is exhaustive and TS-enforced).
 */
import { SubscriptionTier } from '@genfeedai/enums';

export type ApiTierEntitlement = {
  /** Whether the tier may mint API keys and authenticate requests with them. */
  apiAccess: boolean;
  /**
   * Requests-per-minute ceiling applied to API-key-authenticated requests.
   *  - a positive number → that per-minute limit
   *  - `0`               → no API access (the limiter denies every request)
   *  - `null`            → no platform-enforced ceiling (Enterprise: custom / negotiated per SLA)
   */
  apiRateLimit: number | null;
};

/** Higher ceiling for the Pro tier. */
export const HIGHER_API_RATE_LIMIT = 300;
/** Highest fixed ceiling for the Scale tier. */
export const SCALE_API_RATE_LIMIT = 600;

/**
 * Exhaustive tier → entitlement map. Free tiers (FREE, BYOK) get no API access;
 * every paid tier does, with an escalating rate limit; Enterprise is uncapped
 * (custom / negotiated).
 */
export const TIER_API_ENTITLEMENTS: Record<
  SubscriptionTier,
  ApiTierEntitlement
> = {
  [SubscriptionTier.FREE]: { apiAccess: false, apiRateLimit: 0 },
  [SubscriptionTier.BYOK]: { apiAccess: false, apiRateLimit: 0 },
  [SubscriptionTier.PRO]: {
    apiAccess: true,
    apiRateLimit: HIGHER_API_RATE_LIMIT,
  },
  [SubscriptionTier.SCALE]: {
    apiAccess: true,
    apiRateLimit: SCALE_API_RATE_LIMIT,
  },
  [SubscriptionTier.ENTERPRISE]: { apiAccess: true, apiRateLimit: null },
};

/**
 * Default-deny entitlement for an unknown/empty tier. In a managed-cloud
 * deployment an org with no resolvable paid tier has no API access.
 */
const NO_API_ENTITLEMENT: ApiTierEntitlement = {
  apiAccess: false,
  apiRateLimit: 0,
};

/**
 * Resolve the API entitlement for a subscription tier. Accepts the raw string
 * stored on `OrganizationSetting.subscriptionTier`; unknown/empty tiers
 * default-deny.
 */
export function getApiEntitlementForTier(
  tier: string | null | undefined,
): ApiTierEntitlement {
  if (!tier) {
    return NO_API_ENTITLEMENT;
  }
  return TIER_API_ENTITLEMENTS[tier as SubscriptionTier] ?? NO_API_ENTITLEMENT;
}

/** Whether a tier may create and use API keys. */
export function hasApiAccess(tier: string | null | undefined): boolean {
  return getApiEntitlementForTier(tier).apiAccess;
}

/**
 * Per-minute rate limit for a tier. `null` means no platform-enforced ceiling
 * (Enterprise custom); `0` means the tier has no API access.
 */
export function getApiRateLimitForTier(
  tier: string | null | undefined,
): number | null {
  return getApiEntitlementForTier(tier).apiRateLimit;
}
