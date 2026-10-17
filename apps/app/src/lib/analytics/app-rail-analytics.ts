import type {
  AppRailNavigationEvent,
  AppRailReorderEvent,
} from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import { ANALYTICS_EVENTS } from './analytics-events';
import { captureAnalyticsEvent } from './posthog-client';

export function captureAppRailNavigation(event: AppRailNavigationEvent): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.APP_RAIL_NAVIGATED, {
    from_app: event.from_app,
    to_app: event.to_app,
    via: event.via,
    surface: event.surface,
  });
}

export function captureAppRailReorder(event: AppRailReorderEvent): void {
  captureAnalyticsEvent(ANALYTICS_EVENTS.APP_RAIL_REORDERED, {
    app: event.app,
    from_index: event.from_index,
    to_index: event.to_index,
    surface: event.surface,
  });
}
