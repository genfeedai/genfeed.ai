import { SubscriptionTier } from '@genfeedai/contracts';
import {
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
  videoRetentionDays,
} from '@genfeedai/contracts/constants';
import {
  formatResearchScanLimit,
  getPlanByTier,
  getPlanLabel,
  PAYG_POSTS_PER_DAY,
  PLAN_LIMIT_UNLIMITED,
  PLAN_POSTS_PER_DAY_RANGE,
  type PlanTier,
  RESEARCH_SCAN_LIMITS,
  TIER_PLAN_ENTITLEMENTS,
  type TierLimit,
  type TierPlanEntitlement,
} from '@genfeedai/pricing';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { serviceOffering } from '@web-components/landing/service-offering.data';

/** Plans shown as columns of the compare table, in display order. */
export const COMPARE_TIERS: readonly PlanTier[] = [
  'payg',
  'pro',
  'scale',
  'enterprise',
];

/** Subscription tier whose entitlements back each public plan. */
const ENTITLEMENT_TIER: Record<PlanTier, SubscriptionTier> = {
  enterprise: SubscriptionTier.ENTERPRISE,
  payg: SubscriptionTier.FREE,
  pro: SubscriptionTier.PRO,
  scale: SubscriptionTier.SCALE,
};

export interface PricingCompareRow {
  /** Row label, e.g. "Seats". */
  label: string;
  /** One cell per entry of COMPARE_TIERS, in the same order. */
  values: string[];
}

function entitlementOf(tier: PlanTier): TierPlanEntitlement {
  return TIER_PLAN_ENTITLEMENTS[ENTITLEMENT_TIER[tier]];
}

function formatLimit(limit: TierLimit): string {
  return limit === PLAN_LIMIT_UNLIMITED
    ? 'Unlimited'
    : formatNumberWithCommas(limit);
}

/** Cell value for an included feature; the table renders it as a labelled checkmark. */
export const COMPARE_CHECKMARK = '✓';

function formatFlag(isIncluded: boolean): string {
  return isIncluded ? COMPARE_CHECKMARK : '—';
}

function formatApiRate(tier: PlanTier): string {
  const { apiAccess, apiRateLimit } = entitlementOf(tier);
  if (!apiAccess) return '—';
  return apiRateLimit === null
    ? 'Custom'
    : `${formatNumberWithCommas(apiRateLimit)}/min`;
}

function formatMonthlyCredits(tier: PlanTier): string {
  const { includedCredits, type } = getPlanByTier(tier);
  if (includedCredits != null) return formatNumberWithCommas(includedCredits);
  return type === 'enterprise' ? 'Custom' : '—';
}

/** Whether a tier has a subscription (Pay As You Go does not). */
function hasPaidApps(tier: PlanTier): boolean {
  return getPlanByTier(tier).type !== 'payg';
}

/**
 * Whether a tier may use an app. An app that needs a subscription
 * (`ORGANIZATION_MODULES`) is open to subscribers only; the rest are open to
 * every plan. Discovery is trends and competitor ads, Messages the inbox and
 * Automation the workflows.
 */
function unlocksModule(
  tier: PlanTier,
  moduleId: OrganizationModuleId,
): boolean {
  return (
    !ORGANIZATION_MODULES[moduleId].requiresSubscription || hasPaidApps(tier)
  );
}

/** Scans each library allows a tier: "1 a week", "5 a day", "Unlimited". */
function formatScans(tier: PlanTier): string {
  return formatResearchScanLimit(RESEARCH_SCAN_LIMITS[ENTITLEMENT_TIER[tier]]);
}

function formatPostsPerDay(tier: PlanTier): string {
  return hasPaidApps(tier)
    ? PLAN_POSTS_PER_DAY_RANGE
    : `${PAYG_POSTS_PER_DAY} after a top-up`;
}

/**
 * Rows of the pricing compare table. Every cell comes from the plan records or
 * the per-tier entitlements, so repricing or changing a limit in
 * `@genfeedai/pricing` updates the table with it.
 */
export function buildPricingCompareRows(): PricingCompareRow[] {
  const cells = (read: (tier: PlanTier) => string) =>
    COMPARE_TIERS.map((tier) => read(tier));

  return [
    {
      label: 'Included credits / month',
      values: cells(formatMonthlyCredits),
    },
    {
      label: 'Seats',
      values: cells((tier) => formatLimit(entitlementOf(tier).seatLimit)),
    },
    {
      label: 'Client workspaces',
      values: cells((tier) =>
        formatLimit(entitlementOf(tier).organizationLimit),
      ),
    },
    {
      label: 'Brands and channels',
      values: cells((tier) => formatLimit(entitlementOf(tier).brandLimit)),
    },
    {
      label: 'Unposted video storage',
      values: cells((tier) => `${videoRetentionDays(hasPaidApps(tier))} days`),
    },
    {
      // The shared feed of what is trending is open to every account.
      label: 'Market trends feed',
      values: cells(() => formatFlag(true)),
    },
    {
      label: 'Trend scans in your niche',
      values: cells(formatScans),
    },
    {
      label: 'Competitor ad scans',
      values: cells(formatScans),
    },
    {
      // Saving and remixing what a scan finds is open to every account.
      label: 'Save and remix what a scan finds',
      values: cells(() => formatFlag(true)),
    },
    {
      label: 'Watched competitors rescanned for you',
      values: cells((tier) => formatFlag(hasPaidApps(tier))),
    },
    {
      label: 'Play trend videos in Genfeed',
      values: cells((tier) => formatFlag(unlocksModule(tier, 'discovery'))),
    },
    {
      label: 'Inbox and workflows',
      values: cells((tier) =>
        formatFlag(
          unlocksModule(tier, 'messages') && unlocksModule(tier, 'automation'),
        ),
      ),
    },
    {
      label: 'Posts a day, per account',
      values: cells(formatPostsPerDay),
    },
    {
      label: 'Agent model',
      values: cells((tier) => (hasPaidApps(tier) ? 'Your choice' : 'Default')),
    },
    {
      label: 'Ultra quality',
      values: cells((tier) =>
        formatFlag(tier === 'scale' || tier === 'enterprise'),
      ),
    },
    {
      label: 'Brand model training',
      values: cells((tier) => formatFlag(entitlementOf(tier).trainingAccess)),
    },
    {
      label: 'API requests',
      values: cells(formatApiRate),
    },
    {
      label: 'Bring your own key',
      values: cells((tier) => formatFlag(entitlementOf(tier).byokAccess)),
    },
    {
      label: 'Content made for you',
      values: cells((tier) => formatFlag(tier === 'enterprise')),
    },
  ];
}

/**
 * The fourth column is the done-for-you service, and the pricing card that sells
 * it carries the same name (`serviceOffering.name`), so a buyer sees one offer.
 */
export function getCompareColumnLabels(): string[] {
  return COMPARE_TIERS.map((tier) =>
    tier === 'enterprise' ? serviceOffering.name : getPlanLabel(tier),
  );
}
