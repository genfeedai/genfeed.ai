import { describe, expect, it } from 'vitest';
import {
  compareProductRouteInventories,
  normalizeNextPageRoute,
  runCheckProductRouteInventory,
} from './check-product-route-inventory';

describe('normalizeNextPageRoute', () => {
  it('normalizes route groups and dynamic segments', () => {
    expect(
      normalizeNextPageRoute(
        '/repo/apps/app/app',
        '/repo/apps/app/app/(public)/oauth/[platform]/page.tsx',
      ),
    ).toBe('/oauth/:platform');
  });

  it('normalizes required and optional catch-all segments', () => {
    expect(
      normalizeNextPageRoute(
        '/repo/apps/app/app',
        '/repo/apps/app/app/files/[...path]/page.tsx',
      ),
    ).toBe('/files/*path');
    expect(
      normalizeNextPageRoute(
        '/repo/apps/app/app',
        '/repo/apps/app/app/(protected)/[orgSlug]/~/[orgRootApp]/[[...segments]]/page.tsx',
      ),
    ).toBe('/:orgSlug/~/:orgRootApp/*segments?');
  });
});

describe('compareProductRouteInventories', () => {
  it('reports drift in both protected and public directions', () => {
    const issues = compareProductRouteInventories({
      catchAllExpansions: ['/org/expanded'],
      catchAllPage: '/org/*segments?',
      discoveredProtectedRoutes: [
        '/kept',
        '/missing',
        '/org/*segments?',
        '/legacy',
      ],
      discoveredPublicRoutes: [{ application: 'app', canonicalUrl: '/login' }],
      hardCutPages: ['/legacy'],
      hardCutPrefixes: ['/legacy'],
      protectedRoutes: [
        { canonicalUrl: '/kept', productClass: 'control-plane' },
        { canonicalUrl: '/org/expanded', productClass: 'control-plane' },
        { canonicalUrl: '/stale', productClass: 'control-plane' },
      ],
      publicRoutes: [
        {
          application: 'website',
          canonicalUrl: '/stale',
          productClass: 'marketing',
        },
      ],
    });

    expect(issues).toEqual([
      'Missing protected registration: /missing',
      'Missing public classification: app:/login',
      'Stale protected registration: /stale',
      'Stale public classification: website:/stale',
    ]);
  });

  it('rejects duplicate and invalid classifications', () => {
    const issues = compareProductRouteInventories({
      catchAllExpansions: [],
      catchAllPage: '/org/*segments?',
      discoveredProtectedRoutes: ['/kept', '/kept', '/org/*segments?'],
      discoveredPublicRoutes: [
        { application: 'app', canonicalUrl: '/login' },
        { application: 'app', canonicalUrl: '/login' },
      ],
      hardCutPages: [],
      hardCutPrefixes: [],
      protectedRoutes: [
        { canonicalUrl: '/kept', productClass: 'unknown' },
        { canonicalUrl: '/kept', productClass: 'unknown' },
      ],
      publicRoutes: [
        {
          application: 'app',
          canonicalUrl: '/login',
          productClass: 'authentication',
        },
        {
          application: 'app',
          canonicalUrl: '/login',
          productClass: 'authentication',
        },
      ],
    });

    expect(issues).toEqual([
      'Duplicate protected page route: /kept',
      'Duplicate protected registration: /kept',
      'Duplicate public classification: app:/login',
      'Duplicate public page route: app:/login',
      'Invalid protected product class for /kept: unknown',
      'Invalid protected product class for /kept: unknown',
    ]);
  });
});

describe('runCheckProductRouteInventory', () => {
  it('keeps the checked-in registries aligned with every app-router page', () => {
    expect(runCheckProductRouteInventory()).toMatchObject({
      appPublicRouteCount: 19,
      issues: [],
      protectedPageCount: 196,
      protectedRouteCount: 211,
      publicRouteCount: 62,
      websitePublicRouteCount: 43,
    });
  });
});
