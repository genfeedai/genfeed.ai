import { SubscriptionTier } from '@genfeedai/contracts';
import {
  getPlanByTier,
  getPlanLabel,
  PLAN_LIMIT_UNLIMITED,
  type PlanTier,
  TIER_PLAN_ENTITLEMENTS,
  type TierLimit,
  type TierPlanEntitlement,
} from '@genfeedai/pricing';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';

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

/** Whether a tier unlocks the subscription-only apps (Automation, Messages, Discovery). */
function hasPaidApps(tier: PlanTier): boolean {
  return getPlanByTier(tier).type !== 'payg';
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
      label: 'Automation, Messages, Discovery',
      values: cells((tier) => formatFlag(hasPaidApps(tier))),
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

export function getCompareColumnLabels(): string[] {
  return COMPARE_TIERS.map((tier) => getPlanLabel(tier));
}
