import { SETTINGS_SURFACE_LABELS, SettingsSurface } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type {
  SettingsSearchCatalogOptions,
  SettingsSearchHrefContext,
  SettingsSearchItem,
} from '@genfeedai/props/ui/settings-search/settings-search.props';
import { PERSONAL_SETTINGS_ANCHOR } from './personal-settings-anchor';
import { buildSettingsMenuItems } from './settings-menu-items.config';

const BRAND_SECTION_ITEMS: SettingsSearchItem[] = [
  {
    id: 'brand:writing-voice',
    scope: SettingsSurface.BRAND,
    group: 'Brand Kit',
    label: 'Writing voice',
    description:
      'Tone, style, audience, writing rules, hooks, examples and platform overrides',
    href: `${APP_ROUTES.SETTINGS.BRAND_KIT}?tab=voice`,
    keywords: ['voice', 'tone', 'style', 'writing', 'hooks', 'exemplars'],
  },
  {
    id: 'brand:strategy',
    scope: SettingsSurface.BRAND,
    group: 'Brand Kit',
    label: 'Strategy',
    description: 'Topics, goals, platforms and publishing frequency',
    href: `${APP_ROUTES.SETTINGS.BRAND_KIT}?tab=strategy`,
    keywords: ['strategy', 'topics', 'goals', 'frequency'],
  },
  {
    id: 'brand:guided-setup',
    scope: SettingsSurface.BRAND,
    group: 'Brand Kit',
    label: 'Guided setup',
    description: 'Brand identity interview',
    href: `${APP_ROUTES.SETTINGS.BRAND_KIT}/guided-setup`,
    keywords: ['interview', 'setup', 'identity'],
  },
  {
    id: 'brand:content-rules',
    scope: SettingsSurface.BRAND,
    group: 'Brand Kit',
    label: 'Content rules',
    description: 'Structure, delivery, positioning and examples',
    href: `${APP_ROUTES.SETTINGS.BRAND_KIT}/content-rules`,
    keywords: ['harness', 'rules', 'structure', 'delivery', 'examples'],
  },
  {
    id: 'brand:agent-context',
    scope: SettingsSurface.BRAND,
    group: 'Agent settings',
    label: 'Agent context',
    description: 'Context layers, prompts and memories',
    href: `${APP_ROUTES.SETTINGS.AGENT}?tab=context`,
    keywords: ['context', 'memory', 'prompts'],
  },
  {
    id: 'brand:agent-learning',
    scope: SettingsSurface.BRAND,
    group: 'Agent settings',
    label: 'Learning',
    description: 'Feedback and content memory',
    href: `${APP_ROUTES.SETTINGS.AGENT}?tab=learning`,
    keywords: ['learning', 'feedback', 'memory'],
  },
  {
    id: 'brand:receipts',
    scope: SettingsSurface.BRAND,
    group: 'Agent settings',
    label: 'Generation receipts',
    description: 'Generation inputs and outcomes',
    href: `${APP_ROUTES.SETTINGS.AGENT}?tab=receipts`,
    keywords: ['generation', 'receipts', 'audit'],
  },
  {
    id: 'brand:references',
    scope: SettingsSurface.BRAND,
    group: 'Library',
    label: 'References',
    description: 'Reusable characters, training and availability',
    href: APP_ROUTES.LIBRARY.REFERENCES,
    keywords: ['references', 'characters', 'training', 'availability'],
  },
];

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

  return [
    ...itemsForScope(options.scope, options),
    ...(options.scope === SettingsSurface.BRAND ? BRAND_SECTION_ITEMS : []),
  ];
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
