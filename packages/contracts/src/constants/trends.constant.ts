/**
 * Flat credit cost charged once per successfully delivered daily trends-digest
 * email. The digest is a deterministic ranking of the already-collected global
 * trend corpus (no LLM call), so the cost is low and fixed. Deducted only after
 * a confirmed, non-empty send by the workflow adapter's post-run hook.
 */
export const TREND_DIGEST_CREDIT_COST = 5;
