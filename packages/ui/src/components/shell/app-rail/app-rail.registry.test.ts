import { describe, expect, it } from 'vitest';
import {
  ADMIN_RAIL_APP,
  APP_RAIL_REGISTRY,
  getActiveAppId,
  getAppRailFlagKeyForPath,
  getAppRailHref,
  resolveAppRailHref,
} from './app-rail.registry';

describe('app rail registry', () => {
  it('keeps the daily loop and secondary tools in the contracted order', () => {
    expect(APP_RAIL_REGISTRY.map((app) => app.id)).toEqual([
      'agent',
      'workspace',
      'studio',
      'library',
      'publishing',
      'messages',
      'discovery',
      'analytics',
      'automation',
    ]);
    expect(APP_RAIL_REGISTRY.map((app) => app.group)).toEqual([
      ...Array(6).fill('daily'),
      ...Array(3).fill('tools'),
    ]);
    expect(ADMIN_RAIL_APP.group).toBe('admin');
  });

  it('uses the selected brand only for Agent/Studio on org-scoped routes (#4671)', () => {
    const scope = { orgSlug: 'acme', brandAwareSlug: 'selected' };
    expect(
      APP_RAIL_REGISTRY.slice(0, 3).map((app) => getAppRailHref(app, scope)),
    ).toEqual([
      '/acme/selected/agent',
      '/acme/~/workspace/overview',
      '/acme/selected/studio/generate',
    ]);
    expect(
      getAppRailHref(APP_RAIL_REGISTRY[0], { ...scope, brandSlug: 'routed' }),
    ).toBe('/acme/routed/agent');
  });

  it('preserves task context and the first-asset gate for every navigation entry point', () => {
    expect(
      resolveAppRailHref(APP_RAIL_REGISTRY[1], APP_RAIL_REGISTRY, {
        orgSlug: 'acme',
        brandAwareSlug: 'selected',
        isAssetGateLocked: true,
        preservedSearch: 'taskId=t1',
      }),
    ).toBe('/acme/selected/agent?taskId=t1&locked=workspace');
  });

  it('identifies nested product routes without inventing a source app for settings', () => {
    expect(getActiveAppId(APP_RAIL_REGISTRY, '/acme/brand/studio/clips')).toBe(
      'studio',
    );
    expect(
      getActiveAppId(APP_RAIL_REGISTRY, '/acme/~/analytics/overview'),
    ).toBe('analytics');
    expect(
      getActiveAppId(APP_RAIL_REGISTRY, '/settings/personal'),
    ).toBeUndefined();
    expect(getActiveAppId([ADMIN_RAIL_APP], '/admin/users')).toBe('admin');
  });

  it('maps a route to the module flag that gates it (#5468)', () => {
    expect(getAppRailFlagKeyForPath('/acme/brand/studio/clips')).toBe('studio');
    expect(getAppRailFlagKeyForPath('/acme/~/messages/replies')).toBe(
      'messages',
    );
    expect(getAppRailFlagKeyForPath('/acme/brand/publishing/review')).toBe(
      'publishing',
    );
    // Workspace is the home and has no flag; non-module routes have none.
    expect(getAppRailFlagKeyForPath('/acme/brand/workspace')).toBeUndefined();
    expect(getAppRailFlagKeyForPath('/settings/personal')).toBeUndefined();
    expect(getAppRailFlagKeyForPath('/admin/users')).toBeUndefined();
  });

  it('gates every app except Workspace with a module flag', () => {
    expect(
      APP_RAIL_REGISTRY.filter((app) => !app.visibilityFlagKey).map(
        (app) => app.id,
      ),
    ).toEqual(['workspace']);
  });
});
