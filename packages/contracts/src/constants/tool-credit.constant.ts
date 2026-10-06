/**
 * Flat credit amounts shared by a tool's catalog metadata and the handler
 * that reserves or deducts them. Hand-typed copies of these numbers drift.
 */

/** One applied prompt enhancement. Skipped previews charge nothing. */
export const ENHANCE_PROMPT_CREDIT_COST = 1;

/** One social, newsletter, or article draft from `generate_content`. */
export const GENERATE_CONTENT_TEXT_CREDITS = 2;

/** One X post read, search, or account-activity read. */
export const X_READ_CREDIT_COST = 1;

/** Reserve and settle amount for one successful brand-from-URL scan. */
export const BRAND_FROM_URL_CREDIT_COST = 1;

/**
 * Charged once when a brand interview session is created. Resuming an
 * in-progress session does not charge again.
 */
export const BRAND_INTERVIEW_CREDIT_COST = 10;

/**
 * Credits the clip factory checks per clip before it queues work.
 * Analysis does not use this amount.
 */
export const CLIP_CREDIT_PER_CLIP = 1;

/** Schema maximum for highlight and clip counts on the clip tools. */
export const CLIP_HIGHLIGHT_COUNT_MAXIMUM = 30;

export function clipCreditGateAmount(clipCount: number): number {
  if (!Number.isInteger(clipCount) || clipCount < 0) return 0;
  return clipCount * CLIP_CREDIT_PER_CLIP;
}
