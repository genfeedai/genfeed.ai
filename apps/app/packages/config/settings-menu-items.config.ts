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

export const SETTINGS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: 'Account',
    href: APP_ROUTES.SETTINGS.ROOT,
    hrefScope: 'personal',
    label: 'Personal',
    matchPaths: [APP_ROUTES.SETTINGS.ROOT],
    outline: HiOutlineUser,
    solid: HiUser,
  },
  {
    group: 'Workspace',
    href: APP_ROUTES.SETTINGS.ROOT,
    hrefScope: 'organization',
    label: 'Organization',
    matchPaths: [APP_ROUTES.SETTINGS.ROOT],
    outline: HiOutlineBuildingOffice2,
    solid: HiBuildingOffice2,
  },
  {
    group: 'Workspace',
    href: APP_ROUTES.SETTINGS.BRANDS,
    hrefScope: 'organization',
    label: 'Brand Profiles',
    matchPaths: [APP_ROUTES.SETTINGS.BRANDS],
    outline: HiOutlineTag,
    solid: HiTag,
  },
  {
    group: 'Support',
    href: APP_ROUTES.SETTINGS.HELP,
    hrefScope: 'organization',
    label: 'Help',
    matchPaths: [APP_ROUTES.SETTINGS.HELP],
    outline: HiOutlineQuestionMarkCircle,
    solid: HiQuestionMarkCircle,
  },
];

export const SETTINGS_LOGO_HREF = APP_ROUTES.WORKSPACE.OVERVIEW;
