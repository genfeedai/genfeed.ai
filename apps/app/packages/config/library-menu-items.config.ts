import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiClock,
  HiFolderOpen,
  HiOutlineClock,
  HiOutlineFolderOpen,
  HiOutlinePhoto,
  HiOutlineSquares2X2,
  HiPhoto,
  HiSquares2X2,
} from 'react-icons/hi2';

export const LIBRARY_ASSET_ROUTES = [
  APP_ROUTES.LIBRARY.VIDEOS,
  APP_ROUTES.LIBRARY.IMAGES,
  APP_ROUTES.LIBRARY.GIFS,
  APP_ROUTES.LIBRARY.AVATARS,
  APP_ROUTES.LIBRARY.VOICES,
  APP_ROUTES.LIBRARY.MUSIC,
  APP_ROUTES.LIBRARY.CAPTIONS,
] as const;

export const LIBRARY_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.LIBRARY.OVERVIEW,
    isExactMatch: true,
    label: 'Overview',
    matchPaths: [APP_ROUTES.LIBRARY.ROOT, APP_ROUTES.LIBRARY.OVERVIEW],
    outline: HiOutlineSquares2X2,
    solid: HiSquares2X2,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.VIDEOS,
    label: 'Assets',
    matchPaths: [...LIBRARY_ASSET_ROUTES],
    outline: HiOutlinePhoto,
    solid: HiPhoto,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.MOODBOARD,
    label: 'Mood board',
    matchPaths: [APP_ROUTES.LIBRARY.MOODBOARD],
    outline: HiOutlineFolderOpen,
    solid: HiFolderOpen,
  },
  {
    group: '',
    href: APP_ROUTES.WORKSPACE.ACTIVITY,
    label: 'Activity',
    matchPaths: [APP_ROUTES.WORKSPACE.ACTIVITY],
    outline: HiOutlineClock,
    solid: HiClock,
  },
];

export const LIBRARY_LOGO_HREF = APP_ROUTES.LIBRARY.OVERVIEW;
