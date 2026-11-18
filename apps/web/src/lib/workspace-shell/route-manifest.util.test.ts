import {
  APP_ROUTES,
  ROUTE_MANIFEST,
  ROUTE_MANIFEST_APPS,
} from '@genfeedai/contracts/constants';
import type { RouteManifest } from '@genfeedai/contracts/interfaces/ui/route-manifest.interface';
import { describe, expect, it } from 'vitest';
import {
  createAgentOutputMatcher,
  derivePageHelpRoutes,
  toScopedHref,
  toScopedPattern,
} from './route-manifest.util';
import {
  buildProtectedRouteInventory,
  resolveWorkspaceShellRoute,
} from './workspace-shell-registry';

/** The real manifest plus one brand page declared the way a new route would be. */
const THROWAWAY_MANIFEST: RouteManifest = {
  ...ROUTE_MANIFEST,
  groups: [
    ...ROUTE_MANIFEST.groups,
    {
      fallback: '/workspace',
      mode: 'canvas',
      pages: [
        {
          help: 'workspaceThrowaway',
          isAgentOutput: true,
          path: '/workspace/throwaway',
          title: 'Throwaway page',
        },
      ],
      productClass: 'control-plane',
      scopes: ['brand'],
      surfaceKey: 'workspace',
      switcherItems: ['workspace'],
      telemetryClass: 'product',
    },
  ],
};

const THROWAWAY_URL = '/:orgSlug/:brandSlug/workspace/throwaway';

/** Roots and prefixes in `APP_ROUTES` that are not pages of their own. */
const NOT_PAGE_ROUTES = new Set([
  '/admin/configuration/elements',
  '/admin/overview/analytics',
  '/discovery',
  '/library/shelf',
]);

function collectRouteValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value).flatMap((entry) => collectRouteValues(entry));
}

describe('a route declared once in the manifest', () => {
  it('registers the page with the workspace shell, title and fallback', () => {
    const registration = buildProtectedRouteInventory(THROWAWAY_MANIFEST).find(
      (route) => route.canonicalUrl === THROWAWAY_URL,
    );

    expect(registration).toMatchObject({
      breadcrumb: { leafLabel: 'Throwaway page', rootLabel: 'Workspace' },
      safeFallback: '/:orgSlug/:brandSlug/workspace',
      scope: 'brand',
      surfaceKey: 'workspace',
    });
    expect(
      buildProtectedRouteInventory(ROUTE_MANIFEST).some(
        (route) => route.canonicalUrl === THROWAWAY_URL,
      ),
    ).toBe(false);
  });

  it('adds its help entry', () => {
    expect(derivePageHelpRoutes(THROWAWAY_MANIFEST)).toContainEqual({
      key: 'workspaceThrowaway',
      prefix: '/workspace/throwaway',
    });
    expect(derivePageHelpRoutes(ROUTE_MANIFEST)).not.toContainEqual({
      key: 'workspaceThrowaway',
      prefix: '/workspace/throwaway',
    });
  });

  it('puts the agent beside its output', () => {
    expect(
      createAgentOutputMatcher(THROWAWAY_MANIFEST)('/workspace/throwaway'),
    ).toBe(true);
    expect(
      createAgentOutputMatcher(ROUTE_MANIFEST)('/workspace/throwaway'),
    ).toBe(false);
  });
});

describe('route manifest scope paths', () => {
  it.each([
    ['brand', '/', '/:orgSlug/:brandSlug'],
    [
      'brand',
      '/publishing/posts/:id',
      '/:orgSlug/:brandSlug/publishing/posts/:id',
    ],
    ['organization', '/', '/:orgSlug'],
    ['organization', '/apps', '/:orgSlug/~/apps'],
    ['personal', '/', '/'],
    ['personal', '/settings', '/settings'],
  ] as const)('serves %s path %s at %s', (scope, path, expected) => {
    expect(toScopedPattern(scope, path)).toBe(expected);
  });

  it('keeps an absolute fallback as written and scopes a relative one', () => {
    expect(toScopedHref('organization', '/:orgSlug/~')).toBe('/:orgSlug/~');
    expect(toScopedHref('organization', '/workspace/overview')).toBe(
      '/:orgSlug/~/workspace/overview',
    );
  });
});

describe('route manifest', () => {
  it('declares each help key and help prefix once', () => {
    const helpRoutes = derivePageHelpRoutes(ROUTE_MANIFEST);

    expect(new Set(helpRoutes.map((route) => route.key)).size).toBe(
      helpRoutes.length,
    );
    expect(new Set(helpRoutes.map((route) => route.prefix)).size).toBe(
      helpRoutes.length,
    );
  });

  it('has a rail app for every product root and no root twice', () => {
    const roots = ROUTE_MANIFEST_APPS.map((app) => app.rootPath);

    expect(new Set(roots).size).toBe(roots.length);
    expect(new Set(ROUTE_MANIFEST_APPS.map((app) => app.id)).size).toBe(
      roots.length,
    );
  });

  it('serves every page that APP_ROUTES links to a product app or admin', () => {
    const appRoots = new Set(ROUTE_MANIFEST_APPS.map((app) => app.rootPath));
    const unregistered = collectRouteValues(APP_ROUTES)
      .filter((route) => !NOT_PAGE_ROUTES.has(route))
      .filter(
        (route) =>
          route.startsWith('/admin') || appRoots.has(`/${route.split('/')[1]}`),
      )
      .filter(
        (route) =>
          !resolveWorkspaceShellRoute(
            route.startsWith('/admin') ? route : `/org/brand${route}`,
          ),
      );

    expect(unregistered).toEqual([]);
  });
});
