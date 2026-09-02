import { describe, expect, it } from 'vitest';
import {
  compareProductRouteInventories,
  normalizeNextPageRoute,
  runCheckProductRouteInventory,
} from './check-product-route-inventory';

const VALID_INVENTORY_INPUTS = {
  catchAllExpansions: ['/org/expanded'],
  catchAllPage: '/org/*segments?',
  discoveredProtectedRoutes: ['/kept', '/org/*segments?'],
  discoveredPublicRoutes: [],
  hardCutPages: [],
  hardCutPrefixes: ['/legacy'],
  protectedRoutes: [
    { canonicalUrl: '/kept', productClass: 'control-plane' },
    { canonicalUrl: '/org/expanded', productClass: 'control-plane' },
  ],
  publicRoutes: [],
} as const;

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

  it('fails closed when the organization catch-all page is missing', () => {
    const issues = compareProductRouteInventories({
      ...VALID_INVENTORY_INPUTS,
      discoveredProtectedRoutes: ['/kept'],
    });

    expect(issues).toEqual([
      'Missing organization catch-all page: /org/*segments?',
    ]);
  });

  it('fails closed when a declared hard-cut page is missing', () => {
    const issues = compareProductRouteInventories({
      ...VALID_INVENTORY_INPUTS,
      hardCutPages: ['/legacy'],
    });

    expect(issues).toEqual(['Missing protected hard-cut page: /legacy']);
  });

  it('fails closed when a hard-cut page is not explicitly declared', () => {
    const issues = compareProductRouteInventories({
      ...VALID_INVENTORY_INPUTS,
      discoveredProtectedRoutes: [
        ...VALID_INVENTORY_INPUTS.discoveredProtectedRoutes,
        '/legacy/details',
      ],
    });

    expect(issues).toEqual([
      'Unclassified protected hard-cut page: /legacy/details',
    ]);
  });

  it('fails closed when a hard-cut route enters the trusted registry', () => {
    const issues = compareProductRouteInventories({
      ...VALID_INVENTORY_INPUTS,
      discoveredProtectedRoutes: [
        ...VALID_INVENTORY_INPUTS.discoveredProtectedRoutes,
        '/legacy',
      ],
      hardCutPages: ['/legacy'],
      protectedRoutes: [
        ...VALID_INVENTORY_INPUTS.protectedRoutes,
        { canonicalUrl: '/legacy', productClass: 'control-plane' },
      ],
    });

    expect(issues).toEqual([
      'Hard-cut route is registered: /legacy',
      'Stale protected registration: /legacy',
    ]);
  });
});

describe('runCheckProductRouteInventory', () => {
  it('keeps the checked-in registries aligned with every app-router page', () => {
    expect(runCheckProductRouteInventory()).toMatchObject({
      appPublicRouteCount: 22,
      issues: [],
      protectedPageCount: 232,
      protectedRouteCount: 235,
      publicRouteCount: 75,
      websitePublicRouteCount: 53,
    });
  });
});
