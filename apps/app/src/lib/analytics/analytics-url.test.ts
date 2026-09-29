import { describe, expect, it } from 'vitest';
import {
  normalizeAnalyticsPathname,
  sanitizeAnalyticsUrl,
} from './analytics-url';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('normalizeAnalyticsPathname', () => {
  it('keeps the org-level (~) marker and templatizes only the org slug', () => {
    expect(normalizeAnalyticsPathname('/acme-inc/~/agent')).toBe(
      '/:org/~/agent',
    );
  });

  it('leaves known non-tenant top-level routes untouched', () => {
    expect(normalizeAnalyticsPathname('/login')).toBe('/login');
    expect(normalizeAnalyticsPathname('/settings/profile')).toBe(
      '/settings/profile',
    );
    expect(normalizeAnalyticsPathname('/admin/users')).toBe('/admin/users');
    expect(normalizeAnalyticsPathname('/onboarding/welcome')).toBe(
      '/onboarding/welcome',
    );
  });

  it('collapses uuid, numeric, and cuid-like id segments to :id', () => {
    expect(normalizeAnalyticsPathname(`/acme/brand/studio/edit/${UUID}`)).toBe(
      '/:org/:brand/studio/edit/:id',
    );
    expect(normalizeAnalyticsPathname('/acme/brand/publishing/1234567')).toBe(
      '/:org/:brand/publishing/:id',
    );
    expect(
      normalizeAnalyticsPathname(
        '/acme/brand/publishing/clh3k2j9p0001qa9b8c7d6e5f4',
      ),
    ).toBe('/:org/:brand/publishing/:id');
  });

  it('normalizes the root path', () => {
    expect(normalizeAnalyticsPathname('/')).toBe('/');
    expect(normalizeAnalyticsPathname('')).toBe('/');
  });
});

describe('sanitizeAnalyticsUrl', () => {
  it('normalizes ids inside an absolute URL path', () => {
    expect(
      sanitizeAnalyticsUrl(
        `https://app.genfeed.ai/acme/brand/publishing/${UUID}`,
      ),
    ).toBe('https://app.genfeed.ai/:org/:brand/publishing/:id');
  });

  it('degrades malformed or empty input safely without throwing', () => {
    expect(() => sanitizeAnalyticsUrl('')).not.toThrow();
    expect(sanitizeAnalyticsUrl('')).toBe('');
    expect(sanitizeAnalyticsUrl('not a url')).toBe('not a url');
  });
});
