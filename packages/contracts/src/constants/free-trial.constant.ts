const HOUR_MS = 3_600_000;

/**
 * Hosted free trial: an organization that never paid keeps its free credits
 * (signup gift, trial credits, onboarding rewards) for this long after it was
 * created. Past it, the remaining free credits expire and every credit
 * admission is refused until the organization buys credits or subscribes.
 */
export const FREE_TRIAL_DURATION_HOURS = 72;
export const FREE_TRIAL_DURATION_MS = FREE_TRIAL_DURATION_HOURS * HOUR_MS;

/**
 * The trial clock starts when the organization is created. Signup creates the
 * organization in the same request that grants the signup gift, so this is
 * the moment the first free credits land. The column is immutable and set by
 * the database, so it needs no migration and cannot be reset by a client.
 */
export function resolveFreeTrialEndsAt(organizationCreatedAt: Date): Date {
  return new Date(organizationCreatedAt.getTime() + FREE_TRIAL_DURATION_MS);
}
