import type { PlanTier } from '@genfeedai/pricing';

export interface UpgradePlanProps {
  /**
   * Self-serve plans on offer, cheapest first. Free/PAYG is never advertised
   * here, and Enterprise is a conversation rather than a checkout button,
   * hence the contact line under the offers.
   */
  tiers: readonly PlanTier[];
}
