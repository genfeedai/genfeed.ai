import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Box,
  Building2,
  Cpu,
  CreditCard,
  HelpCircle,
  Key,
  LayoutGrid,
  Link,
  MessageSquare,
  Mic,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  User,
  Users,
} from 'lucide-react';

// Brand settings live at brand-scoped `/settings/*` paths (no route constants —
// they resolve against the current brandSlug via the sidebar's `prefixHref`).
const BRAND_SETTINGS = {
  AGENT_DEFAULTS: '/settings/agent-defaults',
  HARNESS: '/settings/harness',
  INTERVIEW: '/settings/interview',
  PUBLISHING: '/settings/publishing',
  VOICE: '/settings/voice',
} as const;

/** Which settings context the sidebar is rendering. */
export type SettingsScope = 'personal' | 'organization' | 'brand';

export interface BuildSettingsMenuItemsParams {
  /**
   * The current settings context, derived from the route. Each scope renders
   * ONLY its own pages — the sidebar never mixes scopes. Scope switching is
   * handled by the gear dropdown / org + brand switchers, not the sidebar.
   */
  scope: SettingsScope;
  /** SaaS or self-host EE — gates the organization Billing (subscription) entry. */
  isEnterprise?: boolean;
}

function buildPersonalMenuItems(): MenuItemConfig[] {
  return [
    {
      group: 'Account',
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'personal',
      isExactMatch: true,
      label: 'Personal',
      outline: User,
      solid: User,
    },
    {
      group: 'Support',
      href: APP_ROUTES.SETTINGS.HELP,
      hrefScope: 'personal',
      label: 'Help',
      outline: HelpCircle,
      solid: HelpCircle,
    },
  ];
}

function buildOrganizationMenuItems(isEnterprise: boolean): MenuItemConfig[] {
  return [
    {
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'organization',
      isExactMatch: true,
      label: 'General',
      outline: Building2,
      solid: Building2,
    },
    {
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.MEMBERS,
      hrefScope: 'organization',
      label: 'Members',
      outline: Users,
      solid: Users,
    },
    ...(isEnterprise
      ? [
          {
            group: 'Billing',
            href: APP_ROUTES.SETTINGS.BILLING,
            hrefScope: 'organization' as const,
            label: 'Billing',
            outline: CreditCard,
            solid: CreditCard,
          },
        ]
      : []),
    {
      group: 'Billing',
      href: APP_ROUTES.SETTINGS.CREDITS,
      hrefScope: 'organization',
      label: 'Credits',
      outline: CreditCard,
      solid: CreditCard,
    },
    {
      group: 'Developer',
      href: APP_ROUTES.SETTINGS.API_KEYS,
      hrefScope: 'organization',
      label: 'API Keys',
      outline: Key,
      solid: Key,
    },
    {
      group: 'Developer',
      href: APP_ROUTES.SETTINGS.WEBHOOKS,
      hrefScope: 'organization',
      label: 'Webhooks',
      outline: Link,
      solid: Link,
    },
    {
      group: 'Governance',
      href: APP_ROUTES.SETTINGS.POLICY,
      hrefScope: 'organization',
      label: 'Policy',
      outline: ShieldCheck,
      solid: ShieldCheck,
    },
    {
      // Hub to the all-brands list; each brand's own settings open in the
      // brand scope from there.
      group: 'Resources',
      href: APP_ROUTES.SETTINGS.BRANDS,
      hrefScope: 'organization',
      label: 'Brands',
      outline: Tag,
      solid: Tag,
    },
    {
      // Org model settings: enable/disable the models the admin app publishes
      // and pick the org default (used by the studio prompt bar). `/settings/
      // models` redirects to the first tab; the prefix keeps this row active
      // across every model type.
      group: 'Resources',
      href: APP_ROUTES.SETTINGS.MODELS,
      hrefScope: 'organization',
      label: 'Models',
      outline: Box,
      solid: Box,
    },
  ];
}

function buildBrandMenuItems(): MenuItemConfig[] {
  return [
    {
      group: 'Identity',
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'brand',
      isExactMatch: true,
      label: 'Overview',
      outline: LayoutGrid,
      solid: LayoutGrid,
    },
    {
      group: 'Identity',
      href: BRAND_SETTINGS.VOICE,
      hrefScope: 'brand',
      label: 'Voice',
      outline: Mic,
      solid: Mic,
    },
    {
      group: 'Identity',
      href: BRAND_SETTINGS.HARNESS,
      hrefScope: 'brand',
      label: 'Harness',
      outline: Sparkles,
      solid: Sparkles,
    },
    {
      group: 'Identity',
      href: BRAND_SETTINGS.INTERVIEW,
      hrefScope: 'brand',
      label: 'Interview',
      outline: MessageSquare,
      solid: MessageSquare,
    },
    {
      group: 'Operations',
      href: BRAND_SETTINGS.PUBLISHING,
      hrefScope: 'brand',
      label: 'Publishing',
      outline: Send,
      solid: Send,
    },
    {
      group: 'Operations',
      href: BRAND_SETTINGS.AGENT_DEFAULTS,
      hrefScope: 'brand',
      label: 'Agent Defaults',
      outline: Cpu,
      solid: Cpu,
    },
  ];
}

/**
 * Builds the Settings sidebar menu for a single scope. The sidebar is
 * scope-specific: loading organization settings shows only organization pages,
 * personal settings shows only personal pages (+ Help), and a brand's settings
 * show only that brand's pages. Keep the gear dropdown
 * (`packages/ui/.../user-dropdown/UserDropdown.tsx`) as the cross-scope switcher.
 */
export function buildSettingsMenuItems({
  scope,
  isEnterprise = false,
}: BuildSettingsMenuItemsParams): MenuItemConfig[] {
  if (scope === 'brand') {
    return buildBrandMenuItems();
  }

  if (scope === 'organization') {
    return buildOrganizationMenuItems(isEnterprise);
  }

  return buildPersonalMenuItems();
}

export const SETTINGS_LOGO_HREF = APP_ROUTES.WORKSPACE.OVERVIEW;
