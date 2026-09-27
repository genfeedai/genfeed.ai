/**
 * Server-side capture names for the two "dark funnel" PostHog events
 * (genfeedai/genfeed.ai#4969). These strings are mirrored 1:1 with the
 * client-side keys in `apps/app/src/lib/analytics/analytics-events.ts`
 * (`ANALYTICS_EVENTS.ONBOARDING_COMPLETED` /
 * `ANALYTICS_EVENTS.FIRST_SUCCESSFUL_PUBLISH`). Kept as plain string
 * constants here rather than shared with the frontend module so the API
 * never imports from `apps/app`.
 */
export const ONBOARDING_COMPLETED_EVENT = 'onboarding_completed';
export const FIRST_SUCCESSFUL_PUBLISH_EVENT = 'first_successful_publish';
