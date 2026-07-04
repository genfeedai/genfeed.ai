import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiBuildingOffice2,
  HiChatBubbleLeftRight,
  HiCpuChip,
  HiCreditCard,
  HiKey,
  HiMicrophone,
  HiOutlineBuildingOffice2,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCpuChip,
  HiOutlineCreditCard,
  HiOutlineKey,
  HiOutlineMicrophone,
  HiOutlinePaperAirplane,
  HiOutlineQuestionMarkCircle,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
  HiOutlineUser,
  HiOutlineUsers,
  HiPaperAirplane,
  HiQuestionMarkCircle,
  HiShieldCheck,
  HiSparkles,
  HiSquares2X2,
  HiUser,
  HiUsers,
} from 'react-icons/hi2';

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
  /** EE build — gates the organization Billing entry. */
  isEnterprise?: boolean;
}

function buildPersonalMenuItems(): MenuItemConfig[] {
  return [
    {
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'personal',
      isExactMatch: true,
      label: 'Personal',
      outline: HiOutlineUser,
      solid: HiUser,
    },
    {
      href: APP_ROUTES.SETTINGS.HELP,
      hrefScope: 'personal',
      label: 'Help',
      outline: HiOutlineQuestionMarkCircle,
      solid: HiQuestionMarkCircle,
    },
  ];
}

function buildOrganizationMenuItems(isEnterprise: boolean): MenuItemConfig[] {
  return [
    {
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'organization',
      isExactMatch: true,
      label: 'General',
      outline: HiOutlineBuildingOffice2,
      solid: HiBuildingOffice2,
    },
    {
      href: APP_ROUTES.SETTINGS.MEMBERS,
      hrefScope: 'organization',
      label: 'Members',
      outline: HiOutlineUsers,
      solid: HiUsers,
    },
    ...(isEnterprise
      ? [
          {
            href: APP_ROUTES.SETTINGS.BILLING,
            hrefScope: 'organization' as const,
            label: 'Billing',
            outline: HiOutlineCreditCard,
            solid: HiCreditCard,
          },
        ]
      : []),
    {
      href: APP_ROUTES.SETTINGS.API_KEYS,
      hrefScope: 'organization',
      label: 'API Keys',
      outline: HiOutlineKey,
      solid: HiKey,
    },
    {
      href: APP_ROUTES.SETTINGS.POLICY,
      hrefScope: 'organization',
      label: 'Policy',
      outline: HiOutlineShieldCheck,
      solid: HiShieldCheck,
    },
  ];
}

function buildBrandMenuItems(): MenuItemConfig[] {
  return [
    {
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'brand',
      isExactMatch: true,
      label: 'Overview',
      outline: HiOutlineSquares2X2,
      solid: HiSquares2X2,
    },
    {
      href: BRAND_SETTINGS.VOICE,
      hrefScope: 'brand',
      label: 'Voice',
      outline: HiOutlineMicrophone,
      solid: HiMicrophone,
    },
    {
      href: BRAND_SETTINGS.HARNESS,
      hrefScope: 'brand',
      label: 'Harness',
      outline: HiOutlineSparkles,
      solid: HiSparkles,
    },
    {
      href: BRAND_SETTINGS.INTERVIEW,
      hrefScope: 'brand',
      label: 'Interview',
      outline: HiOutlineChatBubbleLeftRight,
      solid: HiChatBubbleLeftRight,
    },
    {
      href: BRAND_SETTINGS.PUBLISHING,
      hrefScope: 'brand',
      label: 'Publishing',
      outline: HiOutlinePaperAirplane,
      solid: HiPaperAirplane,
    },
    {
      href: BRAND_SETTINGS.AGENT_DEFAULTS,
      hrefScope: 'brand',
      label: 'Agent Defaults',
      outline: HiOutlineCpuChip,
      solid: HiCpuChip,
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
