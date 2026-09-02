import type { SettingsSurface } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  Bell,
  Bot,
  Box,
  Building2,
  ChartColumn,
  CircleQuestionMark,
  Cpu,
  CreditCard,
  Flame,
  Key,
  LayoutGrid,
  Link,
  MessageSquare,
  Mic,
  Palette,
  Plug,
  Puzzle,
  Receipt,
  ScanFace,
  Send,
  Share2,
  Sparkles,
  Tag,
  User,
  Users,
} from 'lucide-react';

// Brand settings resolve against the current brandSlug via the sidebar's
// `prefixHref`. Shared route constants cover paths used outside this menu.
const BRAND_SETTINGS = {
  AGENT_DEFAULTS: APP_ROUTES.SETTINGS.AGENT_DEFAULTS,
  CHARACTERS: APP_ROUTES.SETTINGS.CHARACTERS,
  HARNESS: '/settings/harness',
  INTERVIEW: '/settings/interview',
  KIT: '/settings/kit',
  PROFILE: APP_ROUTES.SETTINGS.ROOT,
  PUBLISHING: '/settings/publishing',
  SOCIAL: '/settings/social',
  SKILLS: APP_ROUTES.SETTINGS.SKILLS,
  USAGE: APP_ROUTES.SETTINGS.USAGE,
  VOICE: '/settings/voice',
} as const;

/** Which settings context the sidebar is rendering. */
export type SettingsScope = SettingsSurface;

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
 * - Brand: Brand (public + identity) · Automation (how content runs) ·
 *   Billing (cost attribution)
 * - Personal: Account (Personal, Notifications, Chat, Progress, Help).
 *
 * Naming / paths (deliberate):
 * - Settings is a shell. Personal home is `/settings/personal`. Org home is
 *   `/:orgSlug/~/settings/general`. Brand home stays `/:org/:brand/settings`.
 * - Org sidebar label is **General** (workspace defaults).
 * - Brand sidebar label is **Profile** (public brand identity).
 * - Org **Agents** is agent/automation governance (not legal ToS). Route is
 *   `/settings/agents` so the slug matches the sidebar label.
 */

function buildPersonalMenuItems(): MenuItemConfig[] {
  return [
    {
      group: 'Account',
      href: APP_ROUTES.SETTINGS.PERSONAL,
      hrefScope: 'personal',
      isExactMatch: true,
      label: 'Personal',
      outline: User,
      solid: User,
    },
    {
      group: 'Account',
      href: APP_ROUTES.SETTINGS.NOTIFICATIONS,
      hrefScope: 'personal',
      label: 'Notifications',
      outline: Bell,
      solid: Bell,
    },
    {
      group: 'Account',
      href: APP_ROUTES.SETTINGS.PROGRESS,
      hrefScope: 'personal',
      label: 'Progress',
      outline: Flame,
      solid: Flame,
    },
    {
      group: 'Account',
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
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.GENERAL,
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
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.AGENTS,
      hrefScope: 'organization',
      label: 'Agents',
      outline: Bot,
      solid: Bot,
    },
    // Billing is a sidebar group header only — pages live under it.
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
        ]
      : []),
    ...(isEnterprise
      ? [
          {
            group: 'Billing',
            href: APP_ROUTES.SETTINGS.SUBSCRIPTION,
            hrefScope: 'organization' as const,
            label: 'Subscription',
            outline: Receipt,
            solid: Receipt,
          },
        ]
      : []),
    {
      group: 'Billing',
      href: APP_ROUTES.SETTINGS.USAGE,
      hrefScope: 'organization',
      label: 'Cost & Usage',
      outline: ChartColumn,
      solid: ChartColumn,
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
      href: APP_ROUTES.SETTINGS.INTEGRATIONS,
      hrefScope: 'organization',
      label: 'Integrations',
      outline: Plug,
      solid: Plug,
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
      href: BRAND_SETTINGS.CHARACTERS,
      hrefScope: 'brand',
      label: 'Characters',
      outline: ScanFace,
      solid: ScanFace,
    },
    {
      // Writing voice for agents (tone/style/audience) — not TTS/speech library voices.
      group: 'Brand',
      href: BRAND_SETTINGS.VOICE,
      hrefScope: 'brand',
      label: 'Brand voice',
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
      // Brand-scoped harness profile: structure, delivery knobs, examples for agents.
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
    {
      group: 'Automation',
      href: BRAND_SETTINGS.SKILLS,
      hrefScope: 'brand',
      label: 'Skills',
      outline: Puzzle,
      solid: Puzzle,
    },
    {
      group: 'Billing',
      href: BRAND_SETTINGS.USAGE,
      hrefScope: 'brand',
      label: 'Cost & Usage',
      outline: ChartColumn,
      solid: ChartColumn,
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
