import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import { SETTINGS_SURFACE_LABELS, SettingsSurface } from '@genfeedai/enums';
import type {
  SettingsSearchCatalogOptions,
  SettingsSearchHrefContext,
  SettingsSearchItem,
} from '@genfeedai/props/ui/settings-search/settings-search.props';
import { PERSONAL_SETTINGS_ANCHOR } from './personal-settings-anchor';
import { buildSettingsMenuItems } from './settings-menu-items.config';

const PERSONAL_SECTION_ITEMS: SettingsSearchItem[] = [
  {
    description: 'Theme, language, and account profile',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.PERSONAL}#${PERSONAL_SETTINGS_ANCHOR.APPEARANCE}`,
    id: `personal-section:${PERSONAL_SETTINGS_ANCHOR.APPEARANCE}`,
    keywords: ['theme', 'dark', 'light', 'system', 'appearance'],
    label: 'Appearance',
    scope: SettingsSurface.PERSONAL,
  },
  {
    description: 'The language the app interface is shown in',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.PERSONAL}#${PERSONAL_SETTINGS_ANCHOR.LANGUAGE}`,
    id: `personal-section:${PERSONAL_SETTINGS_ANCHOR.LANGUAGE}`,
    keywords: ['locale', 'language', 'translation'],
    label: 'Language',
    scope: SettingsSurface.PERSONAL,
  },
  {
    description: 'Show studio, workflow editor, and generation pages',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.PERSONAL}#${PERSONAL_SETTINGS_ANCHOR.FEATURES}`,
    id: `personal-section:${PERSONAL_SETTINGS_ANCHOR.FEATURES}`,
    keywords: ['advanced mode', 'features', 'studio', 'power user'],
    label: 'Advanced Mode',
    scope: SettingsSurface.PERSONAL,
  },
  {
    description: 'Workflow and video generation emails',
    group: 'Account',
    href: APP_ROUTES.SETTINGS.NOTIFICATIONS,
    id: `personal-section:${PERSONAL_SETTINGS_ANCHOR.EMAIL_NOTIFICATIONS}`,
    keywords: ['email', 'notifications', 'workflow', 'video'],
    label: 'Email Notifications',
    scope: SettingsSurface.PERSONAL,
  },
  {
    description: 'Review every setup step',
    group: 'Account',
    href: APP_ROUTES.SETTINGS.PROGRESS,
    id: `personal-section:${PERSONAL_SETTINGS_ANCHOR.SETUP_CHECKLIST}`,
    keywords: ['setup', 'checklist', 'onboarding', 'progress'],
    label: 'Setup checklist',
    scope: SettingsSurface.PERSONAL,
  },
];

function uniqueKeywords(values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => (value ? value.split(/\s+/u) : []))
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ];
}

function itemsForScope(
  scope: SettingsSurface,
  options: SettingsSearchCatalogOptions,
): SettingsSearchItem[] {
  return buildSettingsMenuItems({
    isEnterprise: options.isEnterprise,
    scope,
    showCredits: options.showCredits,
  }).flatMap((item) => {
    if (!item.href) {
      return [];
    }

    return [
      {
        description: item.group ? `${item.group} · ${item.label}` : item.label,
        group: item.group ?? '',
        href: item.href,
        id: `${scope}:${item.href}`,
        keywords: uniqueKeywords([item.label, item.group, scope]),
        label: item.label,
        scope,
      },
    ];
  });
}

export function buildSettingsSearchCatalog(
  options: SettingsSearchCatalogOptions,
): SettingsSearchItem[] {
  if (options.scope === SettingsSurface.PERSONAL) {
    const personalItems = itemsForScope(SettingsSurface.PERSONAL, options);
    return [
      ...personalItems.filter((item) => item.group === 'Account'),
      ...PERSONAL_SECTION_ITEMS,
      ...personalItems.filter((item) => item.group !== 'Account'),
    ];
  }

  return itemsForScope(options.scope, options);
}

export function filterSettingsSearchCatalog(
  items: readonly SettingsSearchItem[],
  query: string,
): SettingsSearchItem[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return [...items];
  }

  return items.filter((item) => {
    const haystack = [
      item.label,
      item.description,
      item.group,
      item.scope,
      SETTINGS_SURFACE_LABELS[item.scope],
      ...item.keywords,
    ]
      .join(' ')
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

export function resolveSettingsSearchHref(
  item: SettingsSearchItem,
  context: SettingsSearchHrefContext,
): string | null {
  const hashIndex = item.href.indexOf('#');
  const pathname = hashIndex >= 0 ? item.href.slice(0, hashIndex) : item.href;
  const hash = hashIndex >= 0 ? item.href.slice(hashIndex) : '';

  if (item.scope === SettingsSurface.PERSONAL) {
    return `${pathname}${hash}`;
  }

  if (!context.orgSlug) {
    return null;
  }

  if (item.scope === SettingsSurface.ORGANIZATION) {
    return `${createOrganizationAppRoute(context.orgSlug, pathname)}${hash}`;
  }

  if (!context.brandSlug) {
    return null;
  }

  return `${createBrandAppRoute(context.orgSlug, context.brandSlug, pathname)}${hash}`;
}
