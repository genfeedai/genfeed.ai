import { SETTINGS_SURFACE_LABELS, SettingsSurface } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { PERSONAL_SETTINGS_ANCHOR } from './personal-settings-anchor';
import {
  buildSettingsSearchCatalog,
  filterSettingsSearchCatalog,
  resolveSettingsSearchHref,
} from './settings-search-catalog';

describe('buildSettingsSearchCatalog', () => {
  it('keeps personal search inside personal settings', () => {
    const catalog = buildSettingsSearchCatalog({
      isEnterprise: true,
      scope: SettingsSurface.PERSONAL,
    });

    expect(SETTINGS_SURFACE_LABELS[SettingsSurface.PERSONAL]).toBe('Personal');
    expect(
      catalog.every((item) => item.scope === SettingsSurface.PERSONAL),
    ).toBe(true);
    expect(catalog.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'personal-section:appearance',
        'personal-section:email-notifications',
      ]),
    );
    expect(catalog.some((item) => item.label === 'Models')).toBe(false);
    expect(catalog.some((item) => item.label === 'Profile')).toBe(false);
  });

  it('derives personal section links and ids from the shared anchors', () => {
    const catalog = buildSettingsSearchCatalog({
      isEnterprise: true,
      scope: SettingsSurface.PERSONAL,
    });

    expect(
      catalog.find(
        (item) =>
          item.id === `personal-section:${PERSONAL_SETTINGS_ANCHOR.APPEARANCE}`,
      )?.href,
    ).toBe(
      `${APP_ROUTES.SETTINGS.PERSONAL}#${PERSONAL_SETTINGS_ANCHOR.APPEARANCE}`,
    );
    expect(
      catalog.find(
        (item) =>
          item.id === `personal-section:${PERSONAL_SETTINGS_ANCHOR.LANGUAGE}`,
      )?.href,
    ).toBe(
      `${APP_ROUTES.SETTINGS.PERSONAL}#${PERSONAL_SETTINGS_ANCHOR.LANGUAGE}`,
    );
    expect(
      catalog.find(
        (item) =>
          item.id === `personal-section:${PERSONAL_SETTINGS_ANCHOR.FEATURES}`,
      )?.href,
    ).toBe(
      `${APP_ROUTES.SETTINGS.PERSONAL}#${PERSONAL_SETTINGS_ANCHOR.FEATURES}`,
    );
    expect(
      catalog.find(
        (item) =>
          item.id ===
          `personal-section:${PERSONAL_SETTINGS_ANCHOR.EMAIL_NOTIFICATIONS}`,
      )?.href,
    ).toBe(APP_ROUTES.SETTINGS.NOTIFICATIONS);
    expect(
      catalog.find(
        (item) =>
          item.id ===
          `personal-section:${PERSONAL_SETTINGS_ANCHOR.SETUP_CHECKLIST}`,
      )?.href,
    ).toBe(APP_ROUTES.SETTINGS.PROGRESS);
  });

  it('keeps organization search inside organization settings', () => {
    const catalog = buildSettingsSearchCatalog({
      isEnterprise: true,
      scope: SettingsSurface.ORGANIZATION,
    });

    expect(
      catalog.every((item) => item.scope === SettingsSurface.ORGANIZATION),
    ).toBe(true);
    expect(
      catalog.some(
        (item) =>
          item.label === 'Models' && item.href === APP_ROUTES.SETTINGS.MODELS,
      ),
    ).toBe(true);
    expect(
      catalog.some((item) => item.id === 'personal-section:appearance'),
    ).toBe(false);
  });

  it('keeps brand search inside brand settings', () => {
    const catalog = buildSettingsSearchCatalog({
      scope: SettingsSurface.BRAND,
    });

    expect(catalog.every((item) => item.scope === SettingsSurface.BRAND)).toBe(
      true,
    );
    expect(catalog.some((item) => item.label === 'Profile')).toBe(true);
    expect(catalog.some((item) => item.label === 'Members')).toBe(false);
  });
});

describe('filterSettingsSearchCatalog', () => {
  const catalog = buildSettingsSearchCatalog({
    isEnterprise: true,
    scope: SettingsSurface.PERSONAL,
  });

  it('returns the full catalog for an empty query', () => {
    expect(filterSettingsSearchCatalog(catalog, '  ')).toHaveLength(
      catalog.length,
    );
  });

  it('finds appearance in personal search without org Models', () => {
    const results = filterSettingsSearchCatalog(catalog, 'theme');

    expect(results.map((item) => item.id)).toEqual(
      expect.arrayContaining(['personal-section:appearance']),
    );
    expect(results.some((item) => item.label === 'Models')).toBe(false);
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
          scope: SettingsSurface.PERSONAL,
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
          scope: SettingsSurface.ORGANIZATION,
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
          scope: SettingsSurface.BRAND,
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
          scope: SettingsSurface.ORGANIZATION,
        },
        { brandSlug: '', orgSlug: '' },
      ),
    ).toBeNull();
  });
});
