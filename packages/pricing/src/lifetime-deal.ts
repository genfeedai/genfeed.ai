/**
 * Lifetime deal: a one-time purchase that gives an organization the Pro plan
 * and its monthly credit allowance for as long as Genfeed Cloud is offered,
 * capped at a fixed number of seats.
 *
 * The price and the monthly credit allowance are not here. The seller sets the
 * price, and each seat stores its own monthly allowance.
 */
/** Seats sold in total. The seat table's unique seat number enforces it. */
export const LIFETIME_DEAL_SEAT_CAP = 100;

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
