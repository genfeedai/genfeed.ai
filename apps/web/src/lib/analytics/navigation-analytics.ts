import type { AnalyticsEventProperties } from './analytics-events';
import { ANALYTICS_EVENTS } from './analytics-events';
import { captureAnalyticsEvent } from './posthog-client';

export function captureNavigationBlocked(
  event: AnalyticsEventProperties[typeof ANALYTICS_EVENTS.NAVIGATION_BLOCKED],
): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.NAVIGATION_BLOCKED, {
    fromRoute: event.fromRoute,
    navigationType: event.navigationType,
    outcome: event.outcome,
    toRoute: event.toRoute,
    waitMs: event.waitMs,
  });
}
