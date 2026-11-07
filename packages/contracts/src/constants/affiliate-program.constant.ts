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

/** Codes one member can hold on a billing account, active or not. */
export const REFERRAL_CODES_PER_OWNER_LIMIT = 25;

/**
 * What a shareable affiliate code may look like. Random codes (12 characters
 * from the Crockford-style alphabet) and codes the owner names themselves
 * (`shayla`, `launch10`) share one shape, so the sign-up link, the claim route
 * and the code form accept exactly the same values. Codes are stored and
 * compared lowercase.
 */
export const REFERRAL_CODE_MIN_LENGTH = 3;
export const REFERRAL_CODE_MAX_LENGTH = 32;
export const REFERRAL_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Words nobody can claim as a code: product and route names that would look
 * official in a shared link, and words that read as an endorsement.
 */
export const RESERVED_REFERRAL_CODES: readonly string[] = [
  'admin',
  'affiliate',
  'affiliates',
  'api',
  'app',
  'billing',
  'free',
  'genfeed',
  'genfeedai',
  'help',
  'login',
  'official',
  'partner',
  'pricing',
  'root',
  'security',
  'sign-in',
  'sign-up',
  'signup',
  'staff',
  'support',
  'team',
];

/** The code as stored and compared: trimmed and lowercase. */
export function normalizeReferralCode(value: string): string {
  return value.trim().toLowerCase();
}

/** Why a code cannot be used, or `null` when it can. */
export type ReferralCodeProblem = 'invalid' | 'reserved';

export function findReferralCodeProblem(
  value: string,
): ReferralCodeProblem | null {
  const code = normalizeReferralCode(value);
  if (
    code.length < REFERRAL_CODE_MIN_LENGTH ||
    code.length > REFERRAL_CODE_MAX_LENGTH ||
    !REFERRAL_CODE_PATTERN.test(code)
  ) {
    return 'invalid';
  }
  return RESERVED_REFERRAL_CODES.includes(code) ? 'reserved' : null;
}

/**
 * The code in a sign-up link or claim request: normalized, or `null` when it
 * cannot be a code at all. Reserved words are not checked here, since no code
 * is ever stored with one; an unknown code is simply not found.
 */
export function parseReferralCode(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const code = normalizeReferralCode(value);
  return code.length >= REFERRAL_CODE_MIN_LENGTH &&
    code.length <= REFERRAL_CODE_MAX_LENGTH &&
    REFERRAL_CODE_PATTERN.test(code)
    ? code
    : null;
}
