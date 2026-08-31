import { describe, expect, it } from 'vitest';
import {
  normalizeAnalyticsPathname,
  sanitizeAnalyticsUrl,
} from './analytics-url';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('normalizeAnalyticsPathname', () => {
  it('templatizes tenant org/brand slugs', () => {
    expect(
      normalizeAnalyticsPathname(
        '/acme-inc/summer-brand/publishing/posts/post-1',
      ),
    ).toBe('/:org/:brand/publishing/posts/post-1');
  });

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

  it('fails closed: an unknown first segment is treated as an org slug', () => {
    expect(normalizeAnalyticsPathname('/some-new-tenant/brand/library')).toBe(
      '/:org/:brand/library',
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

  it('preserves a long all-alpha slug (no digit -> not an id)', () => {
    expect(
      normalizeAnalyticsPathname('/acme/my-really-long-brand-nameeee/library'),
    ).toBe('/:org/:brand/library');
    // A long static route word without digits is not collapsed.
    expect(
      normalizeAnalyticsPathname('/settings/notificationpreferences'),
    ).toBe('/settings/notificationpreferences');
  });

  it('normalizes the root path', () => {
    expect(normalizeAnalyticsPathname('/')).toBe('/');
    expect(normalizeAnalyticsPathname('')).toBe('/');
  });

  it('defensively strips any query or hash that slips in', () => {
    expect(
      normalizeAnalyticsPathname(
        '/acme/brand/publishing/review?title=Secret#x',
      ),
    ).toBe('/:org/:brand/publishing/review');
  });
});

describe('sanitizeAnalyticsUrl', () => {
  it('drops the query string and hash from an absolute URL, keeping origin', () => {
    expect(
      sanitizeAnalyticsUrl(
        'https://app.genfeed.ai/acme/brand/publishing/review?title=My%20Secret%20Post&description=xyz',
      ),
    ).toBe('https://app.genfeed.ai/:org/:brand/publishing/review');
  });

  it('normalizes ids inside an absolute URL path', () => {
    expect(
      sanitizeAnalyticsUrl(
        `https://app.genfeed.ai/acme/brand/publishing/${UUID}`,
      ),
    ).toBe('https://app.genfeed.ai/:org/:brand/publishing/:id');
  });

  it('sanitizes a path-relative value', () => {
    expect(sanitizeAnalyticsUrl(`/acme/brand/studio/edit/${UUID}?zoom=2`)).toBe(
      '/:org/:brand/studio/edit/:id',
    );
  });

  it('degrades malformed or empty input safely without throwing', () => {
    expect(() => sanitizeAnalyticsUrl('')).not.toThrow();
    expect(sanitizeAnalyticsUrl('')).toBe('');
    expect(sanitizeAnalyticsUrl('not a url')).toBe('not a url');
  });

  it('never lets a query string survive on any value', () => {
    const values = [
      'https://app.genfeed.ai/acme/brand/publishing/x?title=Leak',
      '/acme/brand/publishing/review?description=Leak',
    ];
    for (const value of values) {
      expect(sanitizeAnalyticsUrl(value)).not.toContain('?');
      expect(sanitizeAnalyticsUrl(value)).not.toContain('Leak');
    }
  });
});
