/**
 * Per-tier entitlements — the canonical source of truth for the cloud plan
 * limits promised in plans-pricing.ts.
 *
 *   Marketing plan (plans-pricing.ts)      → SubscriptionTier   → finite gates
 *   ─────────────────────────────────────────────────────────────────────────
 *   Pay As You Go (free)                   → FREE               → no API, solo, 1 org
 *   BYOK (free, bring-your-own-key)        → BYOK               → no API, solo, 1 org
 *   Pro                                    → PRO                → API, unlimited seats, 1 org
 *   Scale                                  → SCALE              → API, unlimited seats/orgs
 *   Enterprise                             → ENTERPRISE         → custom API, unlimited seats/orgs
 *
 * Enforcement lives in the API:
 *   - seat gate:    apps/server/api/src/helpers/guards/member-credits/member-credits.guard.ts
 *   - issuance gate:  apps/server/api/src/helpers/guards/api-access/api-access.guard.ts
 *   - rate limiting:  apps/server/api/src/collections/api-keys/services/api-keys.service.ts
 *
 * The map is keyed on the canonical runtime enum `SubscriptionTier`
 * (@genfeedai/enums) — the same value persisted on
 * `OrganizationSetting.subscriptionTier` — so no tier can be silently missed
 * (the `Record<SubscriptionTier, …>` is exhaustive and TS-enforced).
 */
import { SubscriptionTier } from '@genfeedai/enums';

export type TierLimit = number | null;

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

export type TierPlanEntitlement = ApiTierEntitlement & {
  /** Connected brand kits. `null` means no platform-enforced product cap. */
  brandLimit: TierLimit;
  /** Connected publishing/integration channels. `null` means unlimited. */
  channelLimit: TierLimit;
  /** Owned organizations/workspaces. `null` means unlimited organizations. */
  organizationLimit: TierLimit;
  /** Organization seats. `null` means unlimited team seats. */
  seatLimit: TierLimit;
};

export type LimitedPlanResource =
  | 'brands'
  | 'channels'
  | 'organizations'
  | 'seats';

/** Sentinel for product limits that are unlimited for a tier. */
export const PLAN_LIMIT_UNLIMITED = null;

/** PAYG/BYOK solo workspace seat cap. */
export const FREE_SEAT_LIMIT = 1;
/** Free/Creator single-organization workspace cap. */
export const SINGLE_ORGANIZATION_LIMIT = 1;

/** Higher ceiling for the Pro tier. */
export const HIGHER_API_RATE_LIMIT = 300;
/** Highest fixed ceiling for the Scale tier. */
export const SCALE_API_RATE_LIMIT = 600;

/**
 * Exhaustive tier → cloud entitlement map. Free tiers (FREE, BYOK) are solo
 * workspaces with no managed API access; every tier has unlimited brands and
 * channels so credits remain the output meter instead of account topology.
 * Multi-organization workflows start at Scale.
 */
export const TIER_PLAN_ENTITLEMENTS: Record<
  SubscriptionTier,
  TierPlanEntitlement
> = {
  [SubscriptionTier.FREE]: {
    apiAccess: false,
    apiRateLimit: 0,
    brandLimit: PLAN_LIMIT_UNLIMITED,
    channelLimit: PLAN_LIMIT_UNLIMITED,
    organizationLimit: SINGLE_ORGANIZATION_LIMIT,
    seatLimit: FREE_SEAT_LIMIT,
  },
  [SubscriptionTier.BYOK]: {
    apiAccess: false,
    apiRateLimit: 0,
    brandLimit: PLAN_LIMIT_UNLIMITED,
    channelLimit: PLAN_LIMIT_UNLIMITED,
    organizationLimit: SINGLE_ORGANIZATION_LIMIT,
    seatLimit: FREE_SEAT_LIMIT,
  },
  [SubscriptionTier.PRO]: {
    apiAccess: true,
    apiRateLimit: HIGHER_API_RATE_LIMIT,
    brandLimit: PLAN_LIMIT_UNLIMITED,
    channelLimit: PLAN_LIMIT_UNLIMITED,
    organizationLimit: SINGLE_ORGANIZATION_LIMIT,
    seatLimit: PLAN_LIMIT_UNLIMITED,
  },
  [SubscriptionTier.SCALE]: {
    apiAccess: true,
    apiRateLimit: SCALE_API_RATE_LIMIT,
    brandLimit: PLAN_LIMIT_UNLIMITED,
    channelLimit: PLAN_LIMIT_UNLIMITED,
    organizationLimit: PLAN_LIMIT_UNLIMITED,
    seatLimit: PLAN_LIMIT_UNLIMITED,
  },
  [SubscriptionTier.ENTERPRISE]: {
    apiAccess: true,
    apiRateLimit: null,
    brandLimit: PLAN_LIMIT_UNLIMITED,
    channelLimit: PLAN_LIMIT_UNLIMITED,
    organizationLimit: PLAN_LIMIT_UNLIMITED,
    seatLimit: PLAN_LIMIT_UNLIMITED,
  },
};

/**
 * API-only projection kept for existing call sites and tests.
 */
export const TIER_API_ENTITLEMENTS: Record<
  SubscriptionTier,
  ApiTierEntitlement
> = Object.fromEntries(
  Object.entries(TIER_PLAN_ENTITLEMENTS).map(([tier, entitlement]) => [
    tier,
    {
      apiAccess: entitlement.apiAccess,
      apiRateLimit: entitlement.apiRateLimit,
    },
  ]),
) as Record<SubscriptionTier, ApiTierEntitlement>;

/**
 * Default entitlement for unknown/empty tiers. In managed cloud, an org with
 * no resolvable tier behaves like PAYG/free for product limits and API access.
 */
const DEFAULT_PLAN_ENTITLEMENT = TIER_PLAN_ENTITLEMENTS[SubscriptionTier.FREE];

/**
 * Resolve all cloud entitlements for a subscription tier. Accepts the raw
 * string stored on `OrganizationSetting.subscriptionTier`; unknown/empty tiers
 * fall back to PAYG/free behavior.
 */
export function getPlanEntitlementForTier(
  tier: string | null | undefined,
): TierPlanEntitlement {
  if (!tier) {
    return DEFAULT_PLAN_ENTITLEMENT;
  }
  return (
    TIER_PLAN_ENTITLEMENTS[tier as SubscriptionTier] ?? DEFAULT_PLAN_ENTITLEMENT
  );
}

/**
 * Resolve the API entitlement for a subscription tier. Unknown/empty tiers have
 * no API access.
 */
export function getApiEntitlementForTier(
  tier: string | null | undefined,
): ApiTierEntitlement {
  const entitlement = getPlanEntitlementForTier(tier);
  return {
    apiAccess: entitlement.apiAccess,
    apiRateLimit: entitlement.apiRateLimit,
  };
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

/** Connected brand-kit limit for a tier. `null` means unlimited. */
export function getBrandLimitForTier(
  tier: string | null | undefined,
): TierLimit {
  return getPlanEntitlementForTier(tier).brandLimit;
}

/** Connected-channel limit for a tier. `null` means unlimited. */
export function getChannelLimitForTier(
  tier: string | null | undefined,
): TierLimit {
  return getPlanEntitlementForTier(tier).channelLimit;
}

/** Seat limit for a tier. `null` means unlimited seats. */
export function getSeatLimitForTier(
  tier: string | null | undefined,
): TierLimit {
  return getPlanEntitlementForTier(tier).seatLimit;
}

/** Organization/workspace limit for a tier. `null` means unlimited. */
export function getOrganizationLimitForTier(
  tier: string | null | undefined,
): TierLimit {
  return getPlanEntitlementForTier(tier).organizationLimit;
}

/**
 * Next tier that lifts the given finite resource cap. Used for upgrade prompts.
 */
export function getUpgradeTierForLimit(
  resource: LimitedPlanResource,
  tier: string | null | undefined,
): SubscriptionTier | null {
  const currentTier =
    tier && tier in TIER_PLAN_ENTITLEMENTS
      ? (tier as SubscriptionTier)
      : SubscriptionTier.FREE;

  if (
    resource === 'seats' &&
    ![
      SubscriptionTier.PRO,
      SubscriptionTier.SCALE,
      SubscriptionTier.ENTERPRISE,
    ].includes(currentTier as SubscriptionTier)
  ) {
    return SubscriptionTier.PRO;
  }

  if (
    resource === 'organizations' &&
    ![SubscriptionTier.SCALE, SubscriptionTier.ENTERPRISE].includes(currentTier)
  ) {
    return SubscriptionTier.SCALE;
  }

  return null;
}
