/**
 * Affiliate program terms the billing code enforces. The referral service
 * settles rewards from these values and the public /affiliates page reads the
 * same ones, so the page cannot promise more or less than billing pays.
 */

/** Share of the referred account's net, pre-tax PAYG credit purchases. */
export const AFFILIATE_REWARD_RATE_PERCENT = 10;
export const AFFILIATE_REWARD_RATE = AFFILIATE_REWARD_RATE_PERCENT / 100;

/**
 * Purchases earn rewards for this long after the referred account claimed the
 * code, and a settled reward's credits expire this long after they are issued.
 */
export const AFFILIATE_REWARD_WINDOW_MONTHS = 12;

/** Rewards stay pending this long before settlement issues the credits. */
export const AFFILIATE_SETTLEMENT_DELAY_DAYS = 7;
