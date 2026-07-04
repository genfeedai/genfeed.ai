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
  HiOutlineTag,
  HiOutlineUser,
  HiOutlineUsers,
  HiPaperAirplane,
  HiQuestionMarkCircle,
  HiShieldCheck,
  HiSparkles,
  HiSquares2X2,
  HiTag,
  HiUser,
  HiUsers,
} from 'react-icons/hi2';

const ORGANIZATION_GROUP = 'Organization';
const BRANDS_GROUP = 'Brands';

// Brand settings live at brand-scoped `/settings/*` paths (no route constants —
// they resolve against the current brandSlug via the sidebar's `prefixHref`).
const BRAND_SETTINGS = {
  AGENT_DEFAULTS: '/settings/agent-defaults',
  HARNESS: '/settings/harness',
  INTERVIEW: '/settings/interview',
  PUBLISHING: '/settings/publishing',
  VOICE: '/settings/voice',
} as const;

export interface BuildSettingsMenuItemsParams {
  /**
   * Brand slug from the current route (`/[orgSlug]/[brandSlug]/settings/*`).
   * When present the Brands entry expands into that brand's sub-pages; when
   * absent it stays a single flat "Brands" link. Sourced from the route — NOT
   * the selected-brand context — so brand sub-pages never appear on personal or
   * org settings routes where their brand-scoped hrefs cannot resolve.
   */
  routeBrandSlug?: string;
  /** EE build — gates the Organization Billing entry. */
  isEnterprise?: boolean;
}

/**
 * Builds the Settings sidebar menu: one "Settings" section (applied by the
 * shell via `sectionLabel`) containing Personal, an Organization sub-group, the
 * Brands entry, and Help. Sub-pages that were previously in-page tabs now live
 * here as nested menu items. Keep in sync with the gear dropdown in
 * `packages/ui/.../user-dropdown/UserDropdown.tsx`.
 */
export function buildSettingsMenuItems({
  routeBrandSlug,
  isEnterprise = false,
}: BuildSettingsMenuItemsParams = {}): MenuItemConfig[] {
  const organizationItems: MenuItemConfig[] = [
    {
      group: ORGANIZATION_GROUP,
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'organization',
      isCollapsible: true,
      isExactMatch: true,
      label: 'General',
      outline: HiOutlineBuildingOffice2,
      solid: HiBuildingOffice2,
    },
    {
      group: ORGANIZATION_GROUP,
      href: APP_ROUTES.SETTINGS.MEMBERS,
      hrefScope: 'organization',
      label: 'Members',
      outline: HiOutlineUsers,
      solid: HiUsers,
    },
    ...(isEnterprise
      ? [
          {
            group: ORGANIZATION_GROUP,
            href: APP_ROUTES.SETTINGS.BILLING,
            hrefScope: 'organization' as const,
            label: 'Billing',
            outline: HiOutlineCreditCard,
            solid: HiCreditCard,
          },
        ]
      : []),
    {
      group: ORGANIZATION_GROUP,
      href: APP_ROUTES.SETTINGS.API_KEYS,
      hrefScope: 'organization',
      label: 'API Keys',
      outline: HiOutlineKey,
      solid: HiKey,
    },
    {
      group: ORGANIZATION_GROUP,
      href: APP_ROUTES.SETTINGS.POLICY,
      hrefScope: 'organization',
      label: 'Policy',
      outline: HiOutlineShieldCheck,
      solid: HiShieldCheck,
    },
  ];

  const brandsItems: MenuItemConfig[] = routeBrandSlug
    ? [
        {
          group: BRANDS_GROUP,
          href: APP_ROUTES.SETTINGS.BRANDS,
          hrefScope: 'organization',
          isCollapsible: true,
          isExactMatch: true,
          label: 'All Brands',
          outline: HiOutlineTag,
          solid: HiTag,
        },
        {
          group: BRANDS_GROUP,
          href: APP_ROUTES.SETTINGS.ROOT,
          hrefScope: 'brand',
          isExactMatch: true,
          label: 'Overview',
          outline: HiOutlineSquares2X2,
          solid: HiSquares2X2,
        },
        {
          group: BRANDS_GROUP,
          href: BRAND_SETTINGS.VOICE,
          hrefScope: 'brand',
          label: 'Voice',
          outline: HiOutlineMicrophone,
          solid: HiMicrophone,
        },
        {
          group: BRANDS_GROUP,
          href: BRAND_SETTINGS.HARNESS,
          hrefScope: 'brand',
          label: 'Harness',
          outline: HiOutlineSparkles,
          solid: HiSparkles,
        },
        {
          group: BRANDS_GROUP,
          href: BRAND_SETTINGS.INTERVIEW,
          hrefScope: 'brand',
          label: 'Interview',
          outline: HiOutlineChatBubbleLeftRight,
          solid: HiChatBubbleLeftRight,
        },
        {
          group: BRANDS_GROUP,
          href: BRAND_SETTINGS.PUBLISHING,
          hrefScope: 'brand',
          label: 'Publishing',
          outline: HiOutlinePaperAirplane,
          solid: HiPaperAirplane,
        },
        {
          group: BRANDS_GROUP,
          href: BRAND_SETTINGS.AGENT_DEFAULTS,
          hrefScope: 'brand',
          label: 'Agent Defaults',
          outline: HiOutlineCpuChip,
          solid: HiCpuChip,
        },
      ]
    : [
        {
          href: APP_ROUTES.SETTINGS.BRANDS,
          hrefScope: 'organization',
          label: 'Brands',
          outline: HiOutlineTag,
          solid: HiTag,
        },
      ];

  return [
    {
      href: APP_ROUTES.SETTINGS.ROOT,
      hrefScope: 'personal',
      isExactMatch: true,
      label: 'Personal',
      outline: HiOutlineUser,
      solid: HiUser,
    },
    ...organizationItems,
    ...brandsItems,
    {
      href: APP_ROUTES.SETTINGS.HELP,
      hrefScope: 'organization',
      label: 'Help',
      outline: HiOutlineQuestionMarkCircle,
      solid: HiQuestionMarkCircle,
    },
  ];
}

export const SETTINGS_LOGO_HREF = APP_ROUTES.WORKSPACE.OVERVIEW;
