import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { Clapperboard, Film, Layers, Scissors, Zap } from 'lucide-react';

/**
 * Studio ships production surfaces only. One-off media generation moved to the
 * Agent, so the standalone Image/Video/Avatar/Music prompt-bar tabs are gone.
 */
export const STUDIO_MENU_ITEMS: MenuItemConfig[] = [
  {
    // The Remotion timeline used to be a top-level "Editor" app with no nav of
    // its own; it is now Studio's Edit surface.
    group: 'Edit',
    hasDividerAbove: true,
    href: APP_ROUTES.STUDIO.EDIT,
    label: 'Timeline',
    matchPaths: [APP_ROUTES.STUDIO.EDIT],
    outline: Film,
    solid: Film,
  },
  {
    group: 'Automation',
    hasDividerAbove: true,
    href: APP_ROUTES.STUDIO.STORYBOARD,
    label: 'Storyboard',
    matchPaths: [APP_ROUTES.STUDIO.ROOT, APP_ROUTES.STUDIO.STORYBOARD],
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

export const STUDIO_LOGO_HREF = APP_ROUTES.LIBRARY.OVERVIEW;
