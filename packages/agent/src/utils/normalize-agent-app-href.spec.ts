import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import {
  normalizeAgentAppHref,
  normalizeAgentAssetHref,
} from './normalize-agent-app-href';

const IMAGE_ID = testId('image');

describe('normalizeAgentAppHref', () => {
  it('returns undefined for empty hrefs', () => {
    expect(normalizeAgentAppHref(undefined)).toBeUndefined();
    expect(normalizeAgentAppHref(null)).toBeUndefined();
    expect(normalizeAgentAppHref('   ')).toBeUndefined();
  });

  it('rewrites bare legacy publish paths and preserves query/hash', () => {
    expect(normalizeAgentAppHref('/review?tab=failed')).toBe(
      `${APP_ROUTES.PUBLISHING.REVIEW}&tab=failed`,
    );
    expect(normalizeAgentAppHref('/calendar#week')).toBe(
      `${APP_ROUTES.PUBLISHING.CALENDAR}#week`,
    );
    expect(normalizeAgentAppHref('/calendar/posts')).toBe(
      '/publishing/posts?view=calendar',
    );
    expect(normalizeAgentAppHref('/calendar?release=r-1')).toBe(
      '/publishing/posts?view=calendar&release=r-1',
    );
    expect(normalizeAgentAppHref('/drafts')).toBe(
      `${APP_ROUTES.PUBLISHING.POSTS}?publicationState=not-posted`,
    );
  });

  it('rewrites brand-scoped and org-scoped review paths', () => {
    expect(normalizeAgentAppHref('/acme/launch/review?q=1')).toBe(
      `/acme/launch${APP_ROUTES.PUBLISHING.REVIEW}&q=1`,
    );
    expect(normalizeAgentAppHref('/acme/~/review')).toBe(
      `/acme/~${APP_ROUTES.PUBLISHING.REVIEW}`,
    );
  });

  it('rewrites retired gallery asset paths to canonical Library deep links', () => {
    expect(normalizeAgentAppHref(`/g/image/${IMAGE_ID}`)).toBe(
      `/library/assets?categories=IMAGE&categories=IMAGE_EDIT&asset=${IMAGE_ID}`,
    );
    expect(normalizeAgentAppHref('/g/video/video-123#details')).toBe(
      '/library/assets?categories=VIDEO&categories=VIDEO_EDIT&asset=video-123#details',
    );
    expect(normalizeAgentAppHref('/acme/launch/g/voice/voice-123')).toBe(
      '/acme/launch/library/voices?asset=voice-123',
    );
  });

  it.each([
    ['/content/posts?filter=ready#top', '/publishing/posts?filter=ready#top'],
    [
      '/content/articles?search=launch#top',
      '/publishing/posts?type=article&search=launch#top',
    ],
    ['/overview', '/workspace/overview'],
    [
      '/content/articles/article-1?view=edit#body',
      '/publishing/posts/article-1?view=edit#body',
    ],
    [
      '/acme/launch/content/articles/article-1',
      '/acme/launch/publishing/posts/article-1',
    ],
    ['/acme/launch/content/posts#top', '/acme/launch/publishing/posts#top'],
    ['/acme/~/content/articles', '/acme/~/publishing/posts?type=article'],
    [
      '/acme/launch/calendar?release=r1',
      '/acme/launch/publishing/posts?view=calendar&release=r1',
    ],
    [
      '/acme/launch/drafts',
      '/acme/launch/publishing/posts?publicationState=not-posted',
    ],
  ])('repairs saved retired app path %s', (href, expected) => {
    expect(normalizeAgentAppHref(href)).toBe(expected);
  });

  it.each(['connected-accounts', 'agent', 'publishing', 'skills', 'knowledge'])(
    'repairs brand-only settings %s using actual route context',
    (page) => {
      expect(
        normalizeAgentAppHref(`/acme/~/settings/${page}?q=1#top`, {
          orgSlug: 'acme',
          brandSlug: 'launch',
        }),
      ).toBe(`/acme/launch/settings/${page}?q=1#top`);
      expect(
        normalizeAgentAppHref(`/settings/${page}`, {
          orgSlug: 'acme',
          brandSlug: 'launch',
        }),
      ).toBe(`/acme/launch/settings/${page}`);
    },
  );

  it('keeps explicit brands and falls back to Brands without inventing a brand', () => {
    expect(
      normalizeAgentAppHref('/acme/other/settings/connected-accounts', {
        orgSlug: 'acme',
        brandSlug: 'launch',
      }),
    ).toBe('/acme/other/settings/connected-accounts');
    expect(
      normalizeAgentAppHref(
        '/acme/~/settings/connected-accounts?platform=x#top',
      ),
    ).toBe('/acme/~/settings/brands?platform=x#top');
    expect(
      normalizeAgentAppHref('/foreign/~/settings/connected-accounts', {
        orgSlug: 'acme',
        brandSlug: 'launch',
      }),
    ).toBe('/foreign/~/settings/brands');
    expect(normalizeAgentAppHref('/acme/launch/settings')).toBe(
      '/acme/launch/settings',
    );
    expect(normalizeAgentAppHref('/acme/~/settings')).toBe('/acme/~/settings');
    expect(normalizeAgentAppHref('/acme/~/settings/personal')).toBe(
      '/settings/personal',
    );
  });

  it('uses current canonical scope for bare destinations and preserves external URLs', () => {
    const scope = { orgSlug: 'acme', brandSlug: 'launch' };
    expect(
      normalizeAgentAppHref('/publishing/review?filter=ready', scope),
    ).toBe('/acme/launch/publishing/review?filter=ready');
    expect(normalizeAgentAppHref('/agent/new', scope)).toBe(
      '/acme/~/agent/new',
    );
    expect(normalizeAgentAppHref('/settings/subscription', scope)).toBe(
      '/acme/~/settings/subscription',
    );
    expect(normalizeAgentAppHref('/settings/personal', scope)).toBe(
      '/settings/personal',
    );
    expect(
      normalizeAgentAppHref(
        'https://example.com/settings/connected-accounts',
        scope,
      ),
    ).toBe('https://example.com/settings/connected-accounts');
    expect(normalizeAgentAppHref('//example.com/overview', scope)).toBe(
      '//example.com/overview',
    );
  });

  it('leaves already-valid and unknown paths unchanged', () => {
    expect(normalizeAgentAppHref(APP_ROUTES.PUBLISHING.REVIEW)).toBe(
      APP_ROUTES.PUBLISHING.REVIEW,
    );
    expect(normalizeAgentAppHref('/studio/images')).toBe('/studio/images');
  });
});

describe('normalizeAgentAssetHref', () => {
  it('repairs a persisted bare Library CTA with its exact asset id', () => {
    expect(
      normalizeAgentAssetHref('/library/assets', 'generated image/1'),
    ).toBe('/library/assets?asset=generated+image%2F1');
  });

  it('preserves scope, filters, and hash while replacing a stale asset id', () => {
    expect(
      normalizeAgentAssetHref(
        '/acme/launch/library/images?folder=hero&asset=old#details',
        IMAGE_ID,
      ),
    ).toBe(`/acme/launch/library/images?folder=hero&asset=${IMAGE_ID}#details`);
  });

  it('leaves non-Library CTAs unchanged', () => {
    expect(normalizeAgentAssetHref('/publishing/review', IMAGE_ID)).toBe(
      '/publishing/review',
    );
  });
});
