import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Box,
  Building2,
  CircleQuestionMark,
  Cpu,
  CreditCard,
  Key,
  LayoutGrid,
  Link,
  MessageSquare,
  Mic,
  Palette,
  Send,
  Share2,
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
  KIT: '/settings/kit',
  PUBLISHING: '/settings/publishing',
  SOCIAL: '/settings/social',
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

/**
 * Menu grouping rules (keep to 1–2 meaningful headers per scope):
 * - Never add a top-level "Settings" shell label — the route/scope already says that.
 * - Org: Organization (who/what) · Access (money, keys, policy)
 * - Brand: Brand (public + identity) · Automation (how content runs)
 * - Personal: Account · Support
 */

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
      outline: CircleQuestionMark,
      solid: CircleQuestionMark,
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
    {
      // Hub to the all-brands list; each brand's own settings open in brand scope.
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.BRANDS,
      hrefScope: 'organization',
      label: 'Brands',
      outline: Tag,
      solid: Tag,
    },
    {
      // Org model catalog + defaults for the studio prompt bar.
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.MODELS,
      hrefScope: 'organization',
      label: 'Models',
      outline: Box,
      solid: Box,
    },
    ...(isEnterprise
      ? [
          {
            group: 'Access',
            href: APP_ROUTES.SETTINGS.BILLING,
            hrefScope: 'organization' as const,
            label: 'Billing',
            outline: CreditCard,
            solid: CreditCard,
          },
        ]
      : []),
    {
      group: 'Access',
      href: APP_ROUTES.SETTINGS.CREDITS,
      hrefScope: 'organization',
      label: 'Credits',
      outline: CreditCard,
      solid: CreditCard,
    },
    {
      group: 'Access',
      href: APP_ROUTES.SETTINGS.API_KEYS,
      hrefScope: 'organization',
      label: 'API Keys',
      outline: Key,
      solid: Key,
    },
    {
      group: 'Access',
      href: APP_ROUTES.SETTINGS.WEBHOOKS,
      hrefScope: 'organization',
      label: 'Webhooks',
      outline: Link,
      solid: Link,
    },
    {
      group: 'Access',
      href: APP_ROUTES.SETTINGS.POLICY,
      hrefScope: 'organization',
      label: 'Policy',
      outline: ShieldCheck,
      solid: ShieldCheck,
    },
  ];
}

function buildBrandMenuItems(): MenuItemConfig[] {
  return [
    {
      group: 'Brand',
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'brand',
      isExactMatch: true,
      label: 'Profile',
      outline: LayoutGrid,
      solid: LayoutGrid,
    },
    {
      group: 'Brand',
      href: BRAND_SETTINGS.SOCIAL,
      hrefScope: 'brand',
      label: 'Social',
      outline: Share2,
      solid: Share2,
    },
    {
      group: 'Brand',
      href: BRAND_SETTINGS.KIT,
      hrefScope: 'brand',
      label: 'Brand Kit',
      outline: Palette,
      solid: Palette,
    },
    {
      group: 'Brand',
      href: BRAND_SETTINGS.VOICE,
      hrefScope: 'brand',
      label: 'Voice',
      outline: Mic,
      solid: Mic,
    },
    {
      group: 'Brand',
      href: BRAND_SETTINGS.INTERVIEW,
      hrefScope: 'brand',
      label: 'Interview',
      outline: MessageSquare,
      solid: MessageSquare,
    },
    {
      group: 'Automation',
      href: BRAND_SETTINGS.HARNESS,
      hrefScope: 'brand',
      label: 'Harness',
      outline: Sparkles,
      solid: Sparkles,
    },
    {
      group: 'Automation',
      href: BRAND_SETTINGS.PUBLISHING,
      hrefScope: 'brand',
      label: 'Publishing',
      outline: Send,
      solid: Send,
    },
    {
      group: 'Automation',
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
 * scope-specific: brand → brand pages, org → org pages, personal → personal.
 * Scope switching is the gear dropdown / org + brand switchers, not this list.
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
