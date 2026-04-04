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
    href: '/studio/image',
    label: 'Image',
    matchPaths: ['/studio', '/studio/image'],
    outline: HiOutlinePhoto,
    solid: HiPhoto,
  },
  {
    group: '',
    href: '/studio/video',
    label: 'Video',
    matchPaths: ['/studio/video'],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: '',
    href: '/studio/avatar',
    label: 'Avatar',
    matchPaths: ['/studio/avatar'],
    outline: HiOutlineUserGroup,
    solid: HiUserGroup,
  },
  {
    group: '',
    href: '/studio/music',
    label: 'Music',
    matchPaths: ['/studio/music'],
    outline: HiOutlineMusicalNote,
    solid: HiMusicalNote,
  },
  {
    group: '',
    hasDividerAbove: true,
    href: '/studio/batch',
    label: 'Batch',
    matchPaths: ['/studio/batch'],
    outline: HiOutlineRectangleStack,
    solid: HiRectangleStack,
  },
];

export const STUDIO_LOGO_HREF = '/library/ingredients';
