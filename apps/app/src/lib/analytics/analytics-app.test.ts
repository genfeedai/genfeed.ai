import {
  ADMIN_RAIL_CATEGORIES,
  APP_RAIL_REGISTRY,
} from '@ui/shell/app-rail/app-rail.registry';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_APP_PATH_ROOTS, resolveAnalyticsApp } from './analytics-app';

describe('ANALYTICS_APP_PATH_ROOTS', () => {
  it('matches the app rail registry so app slugs never drift', () => {
    const registry = [...APP_RAIL_REGISTRY, ...ADMIN_RAIL_CATEGORIES].map(
      ({ activePathRoots, id }) => ({ activePathRoots, id }),
    );

    expect(ANALYTICS_APP_PATH_ROOTS).toEqual(registry);
  });
});

describe('resolveAnalyticsApp', () => {
  it.each([
    ['/acme/default/agent', 'agent'],
    ['/acme/~/agent', 'agent'],
    ['/acme/default/clipper/abc123', 'clipper'],
    ['/acme/default/publishing/calendar', 'publishing'],
    ['/acme/default/library/assets', 'library'],
    ['/acme/default/workspace/overview', 'workspace'],
    ['/admin/organizations', 'admin-customers'],
    ['/admin/unclaimed-page', 'admin-overview'],
    ['/settings/profile', 'settings'],
    ['/acme/~/settings/brands', 'settings'],
    ['/acme/default/something-new', 'other'],
    ['/', 'other'],
  ])('maps %s to %s', (pathname, app) => {
    expect(resolveAnalyticsApp(pathname)).toBe(app);
  });
});
