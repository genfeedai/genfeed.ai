import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { Clock, FolderOpen, Image, LayoutGrid } from 'lucide-react';

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
    outline: LayoutGrid,
    solid: LayoutGrid,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.VIDEOS,
    label: 'Assets',
    matchPaths: [...LIBRARY_ASSET_ROUTES],
    outline: Image,
    solid: Image,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.MOODBOARD,
    label: 'Mood board',
    matchPaths: [APP_ROUTES.LIBRARY.MOODBOARD],
    outline: FolderOpen,
    solid: FolderOpen,
  },
  {
    group: '',
    href: APP_ROUTES.WORKSPACE.ACTIVITY,
    label: 'Activity',
    matchPaths: [APP_ROUTES.WORKSPACE.ACTIVITY],
    outline: Clock,
    solid: Clock,
  },
];

export const LIBRARY_LOGO_HREF = APP_ROUTES.LIBRARY.OVERVIEW;
