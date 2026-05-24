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
    group: '',
    href: '/settings',
    hrefScope: 'personal',
    label: 'Personal',
    matchPaths: ['/settings'],
    outline: HiOutlineUser,
    solid: HiUser,
  },
  {
    group: '',
    href: '/settings',
    hrefScope: 'organization',
    label: 'Organization',
    matchPaths: ['/settings'],
    outline: HiOutlineBuildingOffice2,
    solid: HiBuildingOffice2,
  },
  {
    group: '',
    href: '/settings/brands',
    hrefScope: 'organization',
    label: 'Brands',
    matchPaths: ['/settings/brands'],
    outline: HiOutlineTag,
    solid: HiTag,
  },
  {
    group: '',
    href: '/settings/help',
    hrefScope: 'organization',
    label: 'Help',
    matchPaths: ['/settings/help'],
    outline: HiOutlineQuestionMarkCircle,
    solid: HiQuestionMarkCircle,
  },
];

export const SETTINGS_LOGO_HREF = '/workspace/overview';
