import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import { toRoutePattern } from '@/lib/navigation/route-pattern';

const RECORD_ID = testId('record');
const BASE = 'https://app.genfeed.ai/acme/brand/library';

describe('toRoutePattern', () => {
  it.each([
    ['/acme/brand/library', '/:orgSlug/:brandSlug/library'],
    [
      `/acme/brand/publishing/posts/${RECORD_ID}`,
      '/:orgSlug/:brandSlug/publishing/posts/:id',
    ],
    [
      '/acme/brand/library/shelf/my-shelf',
      '/:orgSlug/:brandSlug/library/shelf/:shelf',
    ],
    [
      '/acme/brand/platforms/instagram',
      '/:orgSlug/:brandSlug/platforms/:platform',
    ],
    [
      '/acme/brand/automation/library/images',
      '/:orgSlug/:brandSlug/automation/library/:type',
    ],
    ['/acme/~/library', '/:orgSlug/~/library'],
    ['/acme', '/:orgSlug'],
    [`/admin/organizations/${RECORD_ID}`, '/admin/organizations/:id'],
  ])('maps %s to %s', (url, expected) => {
    expect(toRoutePattern(url, BASE)).toBe(expected);
  });

  it('drops the origin, query string and hash', () => {
    expect(
      toRoutePattern(
        'https://app.genfeed.ai/acme/brand/library?q=secret-term#frag',
        BASE,
      ),
    ).toBe('/:orgSlug/:brandSlug/library');
  });

  it('never carries a tenant slug or record id for an unlisted route', () => {
    const pattern = toRoutePattern(
      `/acme-corp/summer-brand/not-a-real-page/${RECORD_ID}`,
      BASE,
    );

    expect(pattern).not.toMatch(
      new RegExp(`acme-corp|summer-brand|${RECORD_ID}`),
    );
  });

  it('returns the root for an unparseable url', () => {
    expect(toRoutePattern('http://', BASE)).toBe('/');
  });
});
