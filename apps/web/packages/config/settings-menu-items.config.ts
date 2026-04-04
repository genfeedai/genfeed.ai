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
    href: '/settings/personal',
    label: 'Personal',
    matchPaths: ['/settings', '/settings/personal'],
    outline: HiOutlineUser,
    solid: HiUser,
  },
  {
    group: '',
    href: '/settings/organization',
    label: 'Organization',
    matchPaths: ['/settings/organization'],
    outline: HiOutlineBuildingOffice2,
    solid: HiBuildingOffice2,
  },
  {
    group: '',
    href: '/settings/brands',
    label: 'Brands',
    matchPaths: ['/settings/brands'],
    outline: HiOutlineTag,
    solid: HiTag,
  },
  {
    group: '',
    href: '/settings/help',
    label: 'Help',
    matchPaths: ['/settings/help'],
    outline: HiOutlineQuestionMarkCircle,
    solid: HiQuestionMarkCircle,
  },
];

export const SETTINGS_LOGO_HREF = '/workspace/overview';
