import { describe, expect, it } from 'vitest';
import { resolveAnalyticsApp } from './analytics-app';

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
