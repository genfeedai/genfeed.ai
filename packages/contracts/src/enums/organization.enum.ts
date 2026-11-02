/**
 * Organization category. Values match Prisma `OrganizationCategory`.
 * @see packages/prisma/prisma/schema.prisma `enum OrganizationCategory`
 */
export enum OrganizationCategory {
  CREATOR = 'CREATOR',
  BUSINESS = 'BUSINESS',
  AGENCY = 'AGENCY',
  EXPERT = 'EXPERT',
}

/**
 * Where an organization stands, derived at read time from its onboarding flag
 * and subscriptions (never stored). Values double as `Badge` status keys.
 */
export enum OrganizationLifecycleStatus {
  ONBOARDING = 'onboarding',
  FREE = 'free',
  TRIAL = 'trial',
  SUBSCRIBED = 'subscribed',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
}

/** Whether an organization was prepared by an operator or signed up on its own. */
export enum OrganizationSourceFilter {
  CONCIERGE = 'concierge',
  SELF_SERVE = 'self_serve',
}
