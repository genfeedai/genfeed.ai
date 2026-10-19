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
  it('points a bare Library CTA at its exact asset id', () => {
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
