import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import type {
  SettingsSearchCatalogOptions,
  SettingsSearchHrefContext,
  SettingsSearchItem,
  SettingsSearchScope,
} from '@genfeedai/props/ui/settings-search/settings-search.props';
import {
  buildSettingsMenuItems,
  type SettingsScope,
} from './settings-menu-items.config';

export const SETTINGS_SEARCH_SCOPE_LABELS: Record<SettingsSearchScope, string> =
  {
    brand: 'Brand',
    organization: 'Organization',
    personal: 'Personal',
  };

const PERSONAL_SECTION_ITEMS: SettingsSearchItem[] = [
  {
    description: 'Theme, language, and account profile',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.ROOT}#appearance`,
    id: 'personal-section:appearance',
    keywords: ['theme', 'dark', 'light', 'system', 'appearance'],
    label: 'Appearance',
    scope: 'personal',
  },
  {
    description: 'The language the app interface is shown in',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.ROOT}#language`,
    id: 'personal-section:language',
    keywords: ['locale', 'language', 'translation'],
    label: 'Language',
    scope: 'personal',
  },
  {
    description: 'Show studio, workflow editor, and generation pages',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.ROOT}#features`,
    id: 'personal-section:features',
    keywords: ['advanced mode', 'features', 'studio', 'power user'],
    label: 'Advanced Mode',
    scope: 'personal',
  },
  {
    description: 'Workflow and video generation emails',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.ROOT}#email-notifications`,
    id: 'personal-section:email-notifications',
    keywords: ['email', 'notifications', 'workflow', 'video'],
    label: 'Email Notifications',
    scope: 'personal',
  },
  {
    description: 'Default chat model and generation priority',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.ROOT}#chat-defaults`,
    id: 'personal-section:chat-defaults',
    keywords: [
      'chat',
      'model',
      'default chat model',
      'auto',
      'priority',
      'llm',
    ],
    label: 'Chat Defaults',
    scope: 'personal',
  },
  {
    description: 'Review every setup step',
    group: 'Account',
    href: `${APP_ROUTES.SETTINGS.ROOT}#setup-checklist`,
    id: 'personal-section:setup-checklist',
    keywords: ['setup', 'checklist', 'onboarding', 'progress'],
    label: 'Setup checklist',
    scope: 'personal',
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
  scope: SettingsScope,
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
  if (options.scope === 'personal') {
    const personalItems = itemsForScope('personal', options);
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
      SETTINGS_SEARCH_SCOPE_LABELS[item.scope],
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

  if (item.scope === 'personal') {
    return `${pathname}${hash}`;
  }

  if (!context.orgSlug) {
    return null;
  }

  if (item.scope === 'organization') {
    return `${createOrganizationAppRoute(context.orgSlug, pathname)}${hash}`;
  }

  if (!context.brandSlug) {
    return null;
  }

  return `${createBrandAppRoute(context.orgSlug, context.brandSlug, pathname)}${hash}`;
}
