import * as Sentry from '@sentry/nextjs';
import { normalizeAnalyticsPathname } from './analytics-url';

/**
 * Sentry scope that mirrors the product analytics context, so an issue reads
 * "which app, which page, which account" without opening PostHog.
 *
 * `app` and `route` hold no account data (the route is the same bounded
 * template PostHog receives) and are set in every build. The account tags are
 * cloud-only: callers set them from the analytics-gated sync components.
 */
export function setSentryRouteContext(app: string, pathname: string): void {
  Sentry.setTag('app', app);
  Sentry.setTag('route', normalizeAnalyticsPathname(pathname));
}

/**
 * `posthog_distinct_id` is the id passed to `posthog.identify`, so it finds the
 * person in PostHog. Pass `undefined` to clear a tag on sign-out.
 */
export function setSentryAccountContext(context: {
  organizationId?: string;
  userId?: string;
}): void {
  Sentry.setTag('posthog_distinct_id', context.userId);
  Sentry.setTag('organization_id', context.organizationId);
}

/** Breadcrumb for a labeled button click, shown on the issue's timeline. */
export function addSentryActionBreadcrumb(action: string): void {
  Sentry.addBreadcrumb({
    category: 'ui.action',
    data: { action },
    level: 'info',
    message: action,
  });
}
