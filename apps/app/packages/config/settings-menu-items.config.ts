import type { SettingsSurface } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  Bell,
  Blocks,
  BookText,
  Bot,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  ChartColumnIncreasing,
  CircleCheck,
  CircleQuestionMark,
  Cpu,
  CreditCard,
  Grip,
  HandHeart,
  IdCard,
  Key,
  Palette,
  PlugZap,
  Settings,
  SlidersHorizontal,
  Smile,
  User,
  Users,
  UsersRound,
  Wallet,
  Webhook,
} from 'lucide-react';

// Brand settings resolve against the current brandSlug via the sidebar's
// `prefixHref`. Shared route constants cover paths used outside this menu.
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
      outline: CircleCheck,
      solid: CircleCheck,
    },
    {
      group: 'Account',
      href: APP_ROUTES.SETTINGS.HELP,
      hrefScope: 'personal',
      label: 'Help',
      outline: CircleQuestionMark,
      solid: CircleQuestionMark,
    },
    {
      group: 'Account',
      href: APP_ROUTES.SETTINGS.ABOUT,
      hrefScope: 'personal',
      label: 'About',
      outline: Smile,
      solid: Smile,
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
      outline: Settings,
      solid: Settings,
    },
    {
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.MODULES,
      hrefScope: 'organization',
      label: 'Modules',
      outline: Grip,
      solid: Grip,
    },
    {
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.PREFERENCES,
      hrefScope: 'organization',
      label: 'Preferences',
      outline: SlidersHorizontal,
      solid: SlidersHorizontal,
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
      outline: BriefcaseBusiness,
      solid: BriefcaseBusiness,
    },
    {
      // Org model catalog + defaults for the studio prompt bar.
      group: 'Organization',
      href: APP_ROUTES.SETTINGS.MODELS,
      hrefScope: 'organization',
      label: 'Models',
      outline: Cpu,
      solid: Cpu,
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
    ...(isEnterprise
      ? [
          {
            group: 'Organization',
            href: APP_ROUTES.SETTINGS.MEMORY,
            hrefScope: 'organization' as const,
            label: 'Memory',
            outline: Brain,
            solid: Brain,
          },
        ]
      : []),
    // Billing is a sidebar group header only — pages live under it.
    ...(showCredits
      ? [
          {
            group: 'Billing',
            href: APP_ROUTES.SETTINGS.CREDITS,
            hrefScope: 'organization' as const,
            label: 'Credits',
            outline: Wallet,
            solid: Wallet,
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
            outline: CreditCard,
            solid: CreditCard,
          },
          {
            group: 'Billing',
            href: APP_ROUTES.SETTINGS.REFERRALS,
            hrefScope: 'organization' as const,
            label: 'Referrals',
            outline: HandHeart,
            solid: HandHeart,
          },
        ]
      : []),
    {
      group: 'Billing',
      href: APP_ROUTES.SETTINGS.USAGE,
      hrefScope: 'organization',
      label: 'Usage',
      outline: ChartColumnIncreasing,
      solid: ChartColumnIncreasing,
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
      outline: PlugZap,
      solid: PlugZap,
    },
    {
      group: 'Developer',
      href: APP_ROUTES.SETTINGS.WEBHOOKS,
      hrefScope: 'organization',
      label: 'Webhooks',
      outline: Webhook,
      solid: Webhook,
    },
  ];
}

function buildBrandMenuItems(): MenuItemConfig[] {
  return [
    {
      group: 'Brand',
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'brand',
      label: 'Brand profile',
      outline: IdCard,
      solid: IdCard,
      isExactMatch: true,
    },
    {
      group: 'Brand',
      href: APP_ROUTES.SETTINGS.BRAND_KIT,
      hrefScope: 'brand',
      label: 'Brand Kit',
      outline: Palette,
      solid: Palette,
    },
    {
      group: 'Brand',
      href: APP_ROUTES.SETTINGS.KNOWLEDGE,
      hrefScope: 'brand',
      label: 'Knowledge',
      outline: BookText,
      solid: BookText,
    },
    {
      group: 'Brand',
      href: APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
      hrefScope: 'brand',
      label: 'Connected accounts',
      outline: UsersRound,
      solid: UsersRound,
    },
    {
      group: 'Automation',
      href: APP_ROUTES.SETTINGS.AGENT,
      hrefScope: 'brand',
      label: 'Agent settings',
      outline: Bot,
      solid: Bot,
    },
    {
      group: 'Automation',
      href: APP_ROUTES.SETTINGS.PUBLISHING,
      hrefScope: 'brand',
      label: 'Publishing',
      outline: CalendarDays,
      solid: CalendarDays,
    },
    {
      group: 'Automation',
      href: APP_ROUTES.SETTINGS.SKILLS,
      hrefScope: 'brand',
      label: 'Skills',
      outline: Blocks,
      solid: Blocks,
    },
    {
      group: 'Usage',
      href: APP_ROUTES.SETTINGS.USAGE,
      hrefScope: 'brand',
      label: 'Usage',
      outline: ChartColumnIncreasing,
      solid: ChartColumnIncreasing,
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
