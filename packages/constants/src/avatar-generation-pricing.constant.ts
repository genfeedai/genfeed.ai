/**
 * Fallback cost for one avatar video when request-scoped pricing did not
 * resolve a positive amount. The remix pipeline reserves this before HeyGen
 * dispatch and settles it exactly once through the shared credit barrier.
 */
export const AVATAR_GENERATION_CREDIT_COST = 1;
