import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiMusicalNote,
  HiOutlineMusicalNote,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineRectangleStack,
  HiOutlineUserGroup,
  HiPhoto,
  HiPlayCircle,
  HiRectangleStack,
  HiUserGroup,
} from 'react-icons/hi2';

export const STUDIO_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.STUDIO.IMAGE,
    label: 'Image',
    matchPaths: [APP_ROUTES.STUDIO.ROOT, APP_ROUTES.STUDIO.IMAGE],
    outline: HiOutlinePhoto,
    solid: HiPhoto,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.VIDEO,
    label: 'Video',
    matchPaths: [APP_ROUTES.STUDIO.VIDEO],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.AVATAR,
    label: 'Avatar',
    matchPaths: [APP_ROUTES.STUDIO.AVATAR],
    outline: HiOutlineUserGroup,
    solid: HiUserGroup,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.MUSIC,
    label: 'Music',
    matchPaths: [APP_ROUTES.STUDIO.MUSIC],
    outline: HiOutlineMusicalNote,
    solid: HiMusicalNote,
  },
  {
    group: '',
    hasDividerAbove: true,
    href: APP_ROUTES.STUDIO.BATCH,
    label: 'Batch',
    matchPaths: [APP_ROUTES.STUDIO.BATCH],
    outline: HiOutlineRectangleStack,
    solid: HiRectangleStack,
  },
];

export const STUDIO_LOGO_HREF = APP_ROUTES.LIBRARY.INGREDIENTS;
