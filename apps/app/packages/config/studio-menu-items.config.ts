import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  CirclePlay,
  Clapperboard,
  Image,
  Layers,
  Music,
  Scissors,
  Users,
  Zap,
} from 'lucide-react';

export const STUDIO_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.STUDIO.IMAGE,
    label: 'Image',
    matchPaths: [APP_ROUTES.STUDIO.ROOT, APP_ROUTES.STUDIO.IMAGE],
    outline: Image,
    solid: Image,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.VIDEO,
    label: 'Video',
    matchPaths: [APP_ROUTES.STUDIO.VIDEO],
    outline: CirclePlay,
    solid: CirclePlay,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.AVATAR,
    label: 'Avatar',
    matchPaths: [APP_ROUTES.STUDIO.AVATAR],
    outline: Users,
    solid: Users,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.MUSIC,
    label: 'Music',
    matchPaths: [APP_ROUTES.STUDIO.MUSIC],
    outline: Music,
    solid: Music,
  },
  {
    group: 'Automation',
    hasDividerAbove: true,
    href: APP_ROUTES.STUDIO.STORYBOARD,
    label: 'Storyboard',
    matchPaths: [APP_ROUTES.STUDIO.STORYBOARD],
    outline: Clapperboard,
    solid: Clapperboard,
  },
  {
    // `/studio/clips` shipped a full page and a workspace-shell breadcrumb but
    // never a nav entry, so it was only reachable by typing the URL.
    group: 'Automation',
    href: APP_ROUTES.STUDIO.CLIPS,
    label: 'Clips',
    matchPaths: [APP_ROUTES.STUDIO.CLIPS],
    outline: Scissors,
    solid: Scissors,
  },
  {
    group: 'Automation',
    href: APP_ROUTES.STUDIO.BATCH,
    label: 'Batch',
    matchPaths: [APP_ROUTES.STUDIO.BATCH],
    outline: Layers,
    solid: Layers,
  },
  {
    group: 'Automation',
    href: APP_ROUTES.STUDIO.FASTLANE,
    label: 'Fastlane',
    matchPaths: [APP_ROUTES.STUDIO.FASTLANE],
    outline: Zap,
    solid: Zap,
  },
];

export const STUDIO_LOGO_HREF = APP_ROUTES.LIBRARY.ROOT;
