import { APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import {
  buildSettingsSearchCatalog,
  filterSettingsSearchCatalog,
  resolveSettingsSearchHref,
  SETTINGS_SEARCH_SCOPE_LABELS,
} from './settings-search-catalog';

describe('buildSettingsSearchCatalog', () => {
  const catalog = buildSettingsSearchCatalog({ isEnterprise: true });

  it('indexes personal, organization, and brand settings', () => {
    expect(SETTINGS_SEARCH_SCOPE_LABELS.personal).toBe('Personal');
    expect(catalog.some((item) => item.scope === 'personal')).toBe(true);
    expect(catalog.some((item) => item.scope === 'organization')).toBe(true);
    expect(catalog.some((item) => item.scope === 'brand')).toBe(true);
  });

  it('includes personal section hits for chat defaults and appearance', () => {
    expect(catalog.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'personal-section:chat-defaults',
        'personal-section:appearance',
        'personal-section:email-notifications',
      ]),
    );
  });

  it('keeps organization Models and brand Profile in the catalog', () => {
    expect(
      catalog.some(
        (item) =>
          item.scope === 'organization' &&
          item.label === 'Models' &&
          item.href === APP_ROUTES.SETTINGS.MODELS,
      ),
    ).toBe(true);
    expect(
      catalog.some(
        (item) => item.scope === 'brand' && item.label === 'Profile',
      ),
    ).toBe(true);
  });
});

describe('filterSettingsSearchCatalog', () => {
  const catalog = buildSettingsSearchCatalog({ isEnterprise: true });

  it('returns the full catalog for an empty query', () => {
    expect(filterSettingsSearchCatalog(catalog, '  ')).toHaveLength(
      catalog.length,
    );
  });

  it('finds chat model settings from personal and org catalogs', () => {
    const results = filterSettingsSearchCatalog(catalog, 'model');

    expect(results.map((item) => item.id)).toEqual(
      expect.arrayContaining(['personal-section:chat-defaults']),
    );
    expect(results.some((item) => item.label === 'Models')).toBe(true);
  });
});

describe('resolveSettingsSearchHref', () => {
  it('leaves personal hrefs unscoped and prefixes org and brand paths', () => {
    expect(
      resolveSettingsSearchHref(
        {
          description: 'Chat Defaults',
          group: 'Account',
          href: '/settings#chat-defaults',
          id: 'personal-section:chat-defaults',
          keywords: ['model'],
          label: 'Chat Defaults',
          scope: 'personal',
        },
        { brandSlug: 'fud-news', orgSlug: 'demo' },
      ),
    ).toBe('/settings#chat-defaults');

    expect(
      resolveSettingsSearchHref(
        {
          description: 'Models',
          group: 'Organization',
          href: APP_ROUTES.SETTINGS.MODELS,
          id: 'organization:/settings/models',
          keywords: ['models'],
          label: 'Models',
          scope: 'organization',
        },
        { brandSlug: 'fud-news', orgSlug: 'demo' },
      ),
    ).toBe('/demo/~/settings/models');

    expect(
      resolveSettingsSearchHref(
        {
          description: 'Brand voice',
          group: 'Brand',
          href: '/settings/voice',
          id: 'brand:/settings/voice',
          keywords: ['voice'],
          label: 'Brand voice',
          scope: 'brand',
        },
        { brandSlug: 'fud-news', orgSlug: 'demo' },
      ),
    ).toBe('/demo/fud-news/settings/voice');
  });

  it('returns null when org or brand context is missing', () => {
    expect(
      resolveSettingsSearchHref(
        {
          description: 'Members',
          group: 'Organization',
          href: APP_ROUTES.SETTINGS.MEMBERS,
          id: 'organization:/settings/members',
          keywords: [],
          label: 'Members',
          scope: 'organization',
        },
        { brandSlug: '', orgSlug: '' },
      ),
    ).toBeNull();
  });
});
