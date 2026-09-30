import { describe, expect, it, vi } from 'vitest';
import { captureAppRailNavigation } from './app-rail-analytics';
import { captureAnalyticsEvent } from './posthog-client';

vi.mock('./posthog-client', () => ({ captureAnalyticsEvent: vi.fn() }));

describe('rail analytics', () => {
  it.each(['click', 'shortcut', 'palette'] as const)(
    'captures %s with only bounded app/surface identifiers',
    (via) => {
      const event = {
        from_app: 'agent',
        to_app: 'studio',
        via,
        surface: 'desktop',
        orgSlug: 'private-org',
        brandSlug: 'private-brand',
        href: '/private',
      } as const;
      captureAppRailNavigation(event);
      expect(captureAnalyticsEvent).toHaveBeenLastCalledWith(
        'app_rail_navigated',
        { from_app: 'agent', to_app: 'studio', via, surface: 'desktop' },
      );
    },
  );
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
