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

/**
 * Server-side activation events (the app only ever emitted generation events
 * from the clipper and `post_published` from the newsletter editor, so
 * "first generation" and "first post" could not be measured). Mirrored 1:1 with
 * `ANALYTICS_EVENTS.GENERATION_COMPLETED` / `ANALYTICS_EVENTS.POST_PUBLISHED`
 * in `apps/app/src/lib/analytics/analytics-events.ts`.
 */
export const GENERATION_COMPLETED_EVENT = 'generation_completed';
export const FIRST_SUCCESSFUL_GENERATION_EVENT = 'first_successful_generation';
export const POST_PUBLISHED_EVENT = 'post_published';
