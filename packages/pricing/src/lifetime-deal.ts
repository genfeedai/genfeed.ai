/**
 * Lifetime deal: a one-time purchase that gives an organization the Pro plan
 * and its monthly credit allowance for as long as Genfeed Cloud is offered,
 * capped at a fixed number of seats.
 *
 * The price and the monthly credit allowance are not here. The price is a
 * Stripe price found by {@link LIFETIME_DEAL_PRICE_LOOKUP_KEY}; its
 * `included_monthly_credits` metadata sets the allowance and falls back to the
 * Pro tier. Creating that price in Stripe is what opens the sale.
 */
import { TIER_INCLUDED_MONTHLY_CREDITS } from './plans-pricing';

/** Seats sold in total. The seat table's unique seat number enforces it. */
export const LIFETIME_DEAL_SEAT_CAP = 100;

/** Stripe `lookup_key` on the active one-time price that sells the deal. */
export const LIFETIME_DEAL_PRICE_LOOKUP_KEY = 'genfeed_lifetime_pro';

/** Stripe session metadata `plan_type` that routes a checkout to the deal. */
export const LIFETIME_DEAL_PLAN_TYPE = 'lifetime';

/** Stripe session metadata key carrying the monthly allowance at purchase. */
export const LIFETIME_DEAL_MONTHLY_CREDITS_METADATA_KEY =
  'lifetime_monthly_credits';

/** Allowance when the Stripe price carries no `included_monthly_credits`. */
export const LIFETIME_DEAL_DEFAULT_MONTHLY_CREDITS =
  TIER_INCLUDED_MONTHLY_CREDITS.pro;

/** A monthly grant expires this many days after it lands, as Scale's does. */
export const LIFETIME_DEAL_CREDIT_EXPIRY_DAYS = 90;

/**
 * The subscription row of a lifetime organization is open-ended: paid-access
 * checks read `currentPeriodEnd`, and a lifetime seat has no billing period.
 */
export const LIFETIME_DEAL_PERIOD_END = new Date('2126-01-01T00:00:00.000Z');

/** Most monthly grants one sweep applies to a seat that fell behind. */
export const LIFETIME_DEAL_MAX_CATCH_UP_GRANTS = 12;

/** The next monthly grant is due one calendar month after `due`, in UTC. */
export function nextLifetimeGrantDate(due: Date): Date {
  const next = new Date(due.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/** Ledger reference for one seat's grant of one month; the dedup key. */
export function lifetimeGrantReferenceId(seatId: string, due: Date): string {
  return `${seatId}:${due.toISOString()}`;
}

export const LIFETIME_DEAL_GRANT_REFERENCE_TYPE = 'lifetime-deal:monthly-grant';
