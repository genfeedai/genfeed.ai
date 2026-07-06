import { SubscriptionTier } from '@genfeedai/enums';

/**
 * Seat policy resolution.
 *
 * Seats are never a meter — credits are the only meter. FREE/BYOK is a solo
 * workspace (1 seat, no member invites); the first teammate is the upgrade
 * moment. Every paid tier (Pro, Scale, Enterprise) includes unlimited seats
 * with no billing gate at all — account-sharing can't dodge a usage meter,
 * so there is nothing to protect by capping team size.
 *
 * See packages/pricing/src/plans-pricing.ts for the customer-facing promise.
 */

/**
 * Free seats for tiers that do NOT include unlimited seats (FREE/BYOK — the
 * solo workspace). Mirrors the Prisma `OrganizationSetting.seatsLimit`
 * default applied at org-creation call sites.
 */
export const DEFAULT_FREE_SEATS = 1;

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
 * - PRO → $49/mo
 * - SCALE → $499/mo
 * - ENTERPRISE → custom
 *
 * All paid tiers are unlimited-seat; only FREE/BYOK stays solo.
 */
const UNLIMITED_SEAT_TIERS: ReadonlySet<string> = new Set([
  SubscriptionTier.PRO,
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
 *   (Pro/Scale/Enterprise); otherwise the finite number of free seats.
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
