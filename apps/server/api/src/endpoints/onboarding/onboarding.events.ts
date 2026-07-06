/**
 * Onboarding domain events.
 *
 * Emitted by resource controllers (e.g. `PATCH /users/me { isOnboardingCompleted }`)
 * and handled inside `OnboardingModule` so the onboarding-specific cascade runs
 * without the resource module importing OnboardingModule — the decoupling that
 * keeps OnboardingModule out of the module dependency graph's cycles
 * (REST audit #1354).
 */
export const ONBOARDING_FUNNEL_COMPLETED_EVENT = 'onboarding.funnel.completed';

export interface IOnboardingFunnelCompletedEvent {
  /** Proactive lead id from the caller's public metadata, when present. */
  proactiveLeadId: string;
  /** Organization the completing user belongs to. */
  organizationId: string;
}
