import { describe, expect, it, vi } from 'vitest';
import { captureAppRailNavigation } from './app-rail-analytics';
import { captureAnalyticsEvent } from './posthog-client';

vi.mock('./posthog-client', () => ({ captureAnalyticsEvent: vi.fn() }));

describe('rail analytics', () => {
  it('reports the drawer and an unselected source without a pathname', () => {
    captureAppRailNavigation({
      from_app: null,
      to_app: 'publishing',
      via: 'click',
      surface: 'drawer',
    });
    expect(captureAnalyticsEvent).toHaveBeenLastCalledWith(
      'app_rail_navigated',
      { from_app: null, to_app: 'publishing', via: 'click', surface: 'drawer' },
    );
  });
});
