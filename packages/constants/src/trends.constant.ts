/**
 * Flat credit cost charged once per successfully delivered daily trends-digest
 * email. The digest is a deterministic ranking of the already-collected global
 * trend corpus (no LLM call), so the cost is low and fixed. Deducted only after
 * a confirmed, non-empty send by the workflow adapter's post-run hook.
 */
export const TREND_DIGEST_CREDIT_COST = 5;

/** Canonical id for the Daily Trends Digest system workflow. */
export const DAILY_TRENDS_DIGEST_CANONICAL_ID = 'daily-trends-digest';

/**
 * Hosted SaaS may only deliver the Daily Trends Digest to this operator
 * inbox. Self-hosted single-tenant still emails the organization owner.
 */
export const TRENDS_DIGEST_CLOUD_OPERATOR_EMAIL = 'vincent@genfeed.ai';

export function isTrendsDigestCloudOperatorEmail(
  email: string | null | undefined,
): boolean {
  return (
    (email ?? '').trim().toLowerCase() === TRENDS_DIGEST_CLOUD_OPERATOR_EMAIL
  );
}
