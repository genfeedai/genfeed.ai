import { SubscriptionTier } from '@genfeedai/enums';

/**
 * Seat policy resolution.
 *
 * Monetization is on credit consumption, never on team size. Adding members is
 * therefore never a hard wall: lower tiers get a finite number of free seats and
 * anything beyond that is credit-metered (not blocked), while the paid team
 * tiers (Cloud Teams and Enterprise) include unlimited seats with no billing
 * gate at all.
 *
 * See packages/pricing/src/plans-pricing.ts for the customer-facing promise.
 */

/**
 * Free seats for tiers that do NOT include unlimited seats (Pay-As-You-Go,
 * Creator/Hosted, BYOK, and self-hosted defaults). Adding members beyond this
 * count is credit-metered, not blocked. Mirrors the Prisma
 * `OrganizationSetting.seatsLimit @default(3)`.
 */
export const DEFAULT_FREE_SEATS = 3;

/**
 * Sentinel returned by {@link resolveEffectiveSeatsLimit} for tiers that include
 * unlimited team seats. `null` means "no seat cap and no billing gate".
 */
export const SEATS_UNLIMITED = null;

/**
 * Fair-use abuse ceiling for unlimited-seat tiers.
 *
 * This is NOT a billing gate and NOT a product limit surfaced to customers — it
 * is a defensive backstop against a runaway or compromised account creating an
 * unbounded number of member rows. It sits far above any realistic team so it
 * never reads as a "seat limit".
 */
export const UNLIMITED_SEATS_FAIR_USE_CEILING = 1000;

/**
 * Subscription tiers whose plans include unlimited team seats.
 * - SCALE → "Cloud Teams" ($499/mo), the tier backing the Teams plan
 * - ENTERPRISE → Enterprise
 *
 * (Cloud Teams checks out on the `scale` Stripe price and Enterprise on the
 * `enterprise` price; see resolveTierFromPriceId in the Stripe webhook support.)
 */
const UNLIMITED_SEAT_TIERS: ReadonlySet<string> = new Set([
  SubscriptionTier.SCALE,
  SubscriptionTier.ENTERPRISE,
]);

/**
 * Whether the given subscription tier includes unlimited team seats.
 */
export function isUnlimitedSeatTier(tier: string | null | undefined): boolean {
  return tier != null && UNLIMITED_SEAT_TIERS.has(tier);
}

/**
 * Resolve the effective seat policy for an organization from its subscription
 * tier and stored fair-use seat count.
 *
 * @param tier - the organization's subscription tier (may be undefined/null for
 *   free or legacy orgs).
 * @param storedSeatsLimit - the org's stored free-seat count (fair-use free
 *   allotment before member adds become credit-metered).
 * @returns `null` ({@link SEATS_UNLIMITED}) when seats are unlimited
 *   (Teams/Enterprise); otherwise the finite number of free seats.
 */
export function resolveEffectiveSeatsLimit(
  tier: string | null | undefined,
  storedSeatsLimit: number | null | undefined,
): number | null {
  if (isUnlimitedSeatTier(tier)) {
    return SEATS_UNLIMITED;
  }

  return storedSeatsLimit ?? DEFAULT_FREE_SEATS;
}
