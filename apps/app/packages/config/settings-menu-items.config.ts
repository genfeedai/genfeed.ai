import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiBuildingOffice2,
  HiOutlineBuildingOffice2,
  HiOutlineQuestionMarkCircle,
  HiOutlineTag,
  HiOutlineUser,
  HiQuestionMarkCircle,
  HiTag,
  HiUser,
} from 'react-icons/hi2';

// Flat, single "Settings" section (see #1231): the sidebar renders these under
// one `sectionLabel="Settings"` header, so per-item `group` values would only
// re-introduce redundant single-item sub-headers. Keep this list in sync with
// the gear dropdown in `packages/ui/.../user-dropdown/UserDropdown.tsx`.
export const SETTINGS_MENU_ITEMS: MenuItemConfig[] = [
  {
    href: APP_ROUTES.SETTINGS.ROOT,
    hrefScope: 'personal',
    label: 'Personal',
    matchPaths: [APP_ROUTES.SETTINGS.ROOT],
    outline: HiOutlineUser,
    solid: HiUser,
  },
  {
    href: APP_ROUTES.SETTINGS.ROOT,
    hrefScope: 'organization',
    label: 'Organization',
    matchPaths: [APP_ROUTES.SETTINGS.ROOT],
    outline: HiOutlineBuildingOffice2,
    solid: HiBuildingOffice2,
  },
  {
    href: APP_ROUTES.SETTINGS.BRANDS,
    hrefScope: 'organization',
    label: 'Brands',
    matchPaths: [APP_ROUTES.SETTINGS.BRANDS],
    outline: HiOutlineTag,
    solid: HiTag,
  },
  {
    href: APP_ROUTES.SETTINGS.HELP,
    hrefScope: 'organization',
    label: 'Help',
    matchPaths: [APP_ROUTES.SETTINGS.HELP],
    outline: HiOutlineQuestionMarkCircle,
    solid: HiQuestionMarkCircle,
  },
];

export const SETTINGS_LOGO_HREF = APP_ROUTES.WORKSPACE.OVERVIEW;
