import { findAnimatedIcon } from '@ui/primitives/animated-icons/animated-icon.registry';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_RAIL_APP,
  ADMIN_RAIL_BACK_APP,
  ADMIN_RAIL_CATEGORIES,
  APP_RAIL_REGISTRY,
  getActiveAppId,
  getAppRailFlagKeyForPath,
  getAppRailHref,
  getRailAppRoute,
  isAppRailItemEnabled,
  isAppRailItemLocked,
} from './app-rail.registry';

describe('app rail registry', () => {
  it('gives every rail icon an animated twin, so every one reacts to hover', () => {
    for (const app of [
      ...APP_RAIL_REGISTRY,
      ADMIN_RAIL_APP,
      ADMIN_RAIL_BACK_APP,
      ...ADMIN_RAIL_CATEGORIES,
    ]) {
      expect(
        findAnimatedIcon(app.icon),
        `${app.id} uses an icon with no animated twin`,
      ).toBeDefined();
    }
  });

  it('keeps the core loop and the launcher apps in the contracted order (#5502)', () => {
    expect(APP_RAIL_REGISTRY.map((app) => app.id)).toEqual([
      'workspace',
      'agent',
      'library',
      'publishing',
      'analytics',
      'playground',
      'storyboard',
      'turbo',
      'motion',
      'clips',
      'editor',
      'automation',
      'messages',
      'discovery',
    ]);
    expect(APP_RAIL_REGISTRY.map((app) => app.group)).toEqual([
      ...Array(5).fill('daily'),
      ...Array(9).fill('app'),
    ]);
    expect(APP_RAIL_REGISTRY.map((app) => app.id)).not.toContain('studio');
    expect(ADMIN_RAIL_APP.group).toBe('admin');
  });

  it('uses the selected brand only for Agent and Studio apps on org-scoped routes (#4671)', () => {
    const scope = { orgSlug: 'acme', brandAwareSlug: 'selected' };
    const app = (id: string) => {
      const match = APP_RAIL_REGISTRY.find((candidate) => candidate.id === id);
      if (!match) throw new Error(`missing rail app ${id}`);
      return match;
    };
    expect(
      ['agent', 'workspace', 'playground', 'turbo', 'editor'].map((id) =>
        getAppRailHref(app(id), scope),
      ),
    ).toEqual([
      '/acme/selected/agent',
      '/acme/~/workspace/overview',
      '/acme/selected/studio/playground',
      '/acme/selected/studio/turbo',
      '/acme/selected/studio/editor',
    ]);
    expect(getAppRailHref(app('clips'), { orgSlug: 'acme' })).toBe(
      '/acme/~/studio/clips',
    );
    expect(
      getAppRailHref(app('agent'), { ...scope, brandSlug: 'routed' }),
    ).toBe('/acme/routed/agent');
  });

  it('keeps a locked app on its own route so the gate teaser can render', () => {
    const workspace = APP_RAIL_REGISTRY.find((app) => app.id === 'workspace');
    if (!workspace) throw new Error('missing workspace rail app');
    expect(isAppRailItemLocked(workspace, true)).toBe(true);
    expect(
      getAppRailHref(workspace, {
        orgSlug: 'acme',
        brandAwareSlug: 'selected',
        brandSlug: 'selected',
        preservedSearch: 'taskId=t1',
      }),
    ).toBe('/acme/selected/workspace/overview?taskId=t1');
  });

  it('identifies nested product routes without inventing a source app for settings', () => {
    expect(getActiveAppId(APP_RAIL_REGISTRY, '/acme/brand/studio/clips')).toBe(
      'clips',
    );
    expect(
      getActiveAppId(APP_RAIL_REGISTRY, '/acme/brand/studio/turbo/new'),
    ).toBe('turbo');
    expect(getActiveAppId(APP_RAIL_REGISTRY, '/acme/brand/studio')).toBe(
      undefined,
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

  it('gates each Studio tool with its own surface switch under the studio module', () => {
    expect(
      Object.fromEntries(
        APP_RAIL_REGISTRY.filter(
          (app) => app.visibilityFlagKey === 'studio',
        ).map((app) => [app.id, app.surfaceFlagKey ?? null]),
      ),
    ).toEqual({
      clips: 'studio_clips',
      editor: 'studio_editor',
      motion: 'studio_motion',
      playground: null,
      storyboard: 'studio_storyboard',
      turbo: 'studio_turbo',
    });
  });

  it('turns an app off when either platform switch is off', () => {
    const clips = APP_RAIL_REGISTRY.find((app) => app.id === 'clips');
    if (!clips) throw new Error('missing clips rail app');
    expect(
      isAppRailItemEnabled(clips, { studio: true, studio_clips: true }, true),
    ).toBe(true);
    expect(
      isAppRailItemEnabled(clips, { studio: true, studio_clips: false }, true),
    ).toBe(false);
    expect(
      isAppRailItemEnabled(clips, { studio: false, studio_clips: true }, true),
    ).toBe(false);
    expect(isAppRailItemEnabled(clips, {}, true)).toBe(false);
    expect(isAppRailItemEnabled(clips, {}, false)).toBe(true);
  });

  it('gates every app except Workspace with a module flag', () => {
    expect(
      APP_RAIL_REGISTRY.filter((app) => !app.visibilityFlagKey).map(
        (app) => app.id,
      ),
    ).toEqual(['workspace']);
  });

  it('keeps ingredient detail and folders under the Content category', () => {
    for (const path of [
      '/admin/images/abc',
      '/admin/videos/abc',
      '/admin/folders',
    ]) {
      expect(getActiveAppId(ADMIN_RAIL_CATEGORIES, path)).toBe('admin-content');
    }
  });

  it('never marks the admin back button active', () => {
    expect(
      getActiveAppId([ADMIN_RAIL_BACK_APP], '/admin/content/posts'),
    ).toBeUndefined();
  });

  it('maps admin paths to one category icon each', () => {
    expect(
      getActiveAppId(ADMIN_RAIL_CATEGORIES, '/admin/overview/dashboard'),
    ).toBe('admin-overview');
    expect(getActiveAppId(ADMIN_RAIL_CATEGORIES, '/admin/content/posts')).toBe(
      'admin-content',
    );
    expect(getActiveAppId(ADMIN_RAIL_CATEGORIES, '/admin/library/voices')).toBe(
      'admin-automation',
    );
    expect(
      getActiveAppId(ADMIN_RAIL_CATEGORIES, '/admin/configuration/tags'),
    ).toBe('admin-configuration');
    expect(getActiveAppId(ADMIN_RAIL_CATEGORIES, '/admin/flags')).toBe(
      'admin-administration',
    );
    expect(
      getActiveAppId(
        ADMIN_RAIL_CATEGORIES,
        '/admin/overview/analytics/organizations',
      ),
    ).toBe('admin-administration');
  });

  describe('getRailAppRoute', () => {
    it('opens a rail app in a brand, or in the organization without one', () => {
      expect(getRailAppRoute('workspace', 'acme', 'moonrise')).toBe(
        '/acme/moonrise/workspace/overview',
      );
      expect(getRailAppRoute('agent', 'acme')).toBe('/acme/~/agent');
      expect(getRailAppRoute('turbo', 'acme', 'moonrise')).toBe(
        '/acme/moonrise/studio/turbo',
      );
    });

    it('has a route for every rail app and none for an unknown id', () => {
      for (const app of APP_RAIL_REGISTRY) {
        expect(getRailAppRoute(app.id, 'acme', 'moonrise')).toBe(
          app.route('acme', 'moonrise'),
        );
      }
      expect(getRailAppRoute('nope', 'acme')).toBeNull();
    });
  });
});
