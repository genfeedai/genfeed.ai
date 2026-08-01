import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  Bot,
  Box,
  Building2,
  ChartColumn,
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
  PROFILE: APP_ROUTES.SETTINGS.PROFILE,
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
  /**
   * Genfeed Credits wallet / packs. Hide for pure local BYOK (desktop shell).
   * Defaults true so community self-host still reaches managed Cloud credits.
   */
  showCredits?: boolean;
}

/**
 * Menu grouping rules (keep meaningful headers per scope):
 * - Never add a top-level "Settings" shell label — the route/scope already says that.
 * - Org: Organization (who/what + Agents defaults) · Billing (money) ·
 *   Developer (keys/webhooks)
 * - Brand: Brand (public + identity) · Automation (how content runs)
 * - Personal: Account · Support
 *
 * Naming / paths (deliberate):
 * - Complete-path homes: bare `/settings` permanently redirects to
 *   `/settings/profile` for **both** org and brand scopes (sidebar active-state).
 * - Org sidebar label is **General** (workspace defaults) at `/settings/profile`.
 * - Brand sidebar label is **Profile** (public brand identity) at the same
 *   relative path under the brand slug — different product surface.
 * - Org **Agents** is agent/automation governance (not legal ToS). Route stays
 *   `/settings/policy`; sidebar label is Agents.
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

function buildOrganizationMenuItems(
  isEnterprise: boolean,
  showCredits: boolean,
): MenuItemConfig[] {
  return [
    {
      // Complete path (not bare /settings) so siblings are not prefix-active.
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.PROFILE,
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
    {
      // Org agent/automation defaults (reply style, autonomy, credit caps).
      // Route remains /settings/policy; label is Agents (not legal policy).
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.POLICY,
      hrefScope: 'organization',
      label: 'Agents',
      outline: Bot,
      solid: Bot,
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
    ...(showCredits
      ? [
          {
            group: 'Billing',
            href: APP_ROUTES.SETTINGS.CREDITS,
            hrefScope: 'organization' as const,
            label: 'Credits',
            outline: CreditCard,
            solid: CreditCard,
          },
          {
            group: 'Billing',
            href: APP_ROUTES.SETTINGS.USAGE,
            hrefScope: 'organization' as const,
            label: 'Usage',
            outline: ChartColumn,
            solid: ChartColumn,
          },
        ]
      : []),
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
  ];
}

function buildBrandMenuItems(): MenuItemConfig[] {
  return [
    {
      group: 'Brand',
      href: BRAND_SETTINGS.PROFILE,
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
  showCredits = true,
}: BuildSettingsMenuItemsParams): MenuItemConfig[] {
  if (scope === 'brand') {
    return buildBrandMenuItems();
  }

  if (scope === 'organization') {
    return buildOrganizationMenuItems(isEnterprise, showCredits);
  }

  return buildPersonalMenuItems();
}

export const SETTINGS_LOGO_HREF = APP_ROUTES.WORKSPACE.OVERVIEW;
