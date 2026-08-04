import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { Clapperboard, Film, Layers, Scissors, Zap } from 'lucide-react';

/**
 * Studio ships production surfaces only. One-off media generation moved to the
 * Agent, so the standalone Image/Video/Avatar/Music prompt-bar tabs are gone.
 *
 * Flat nav under the Studio app chrome (no Edit / Automation subgroups) —
 * same shape as Automate and Library. Storyboard is the production home;
 * Edit is the Remotion timeline (route `/studio/edit` from the #2309 merge of
 * the old top-level Editor app).
 */
export const STUDIO_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.STUDIO.STORYBOARD,
    label: 'Storyboard',
    matchPaths: [APP_ROUTES.STUDIO.ROOT, APP_ROUTES.STUDIO.STORYBOARD],
    outline: Clapperboard,
    solid: Clapperboard,
  },
  {
    // `/studio/clips` shipped a full page and a workspace-shell breadcrumb but
    // never a nav entry, so it was only reachable by typing the URL.
    group: '',
    href: APP_ROUTES.STUDIO.CLIPS,
    label: 'Clips',
    matchPaths: [APP_ROUTES.STUDIO.CLIPS],
    outline: Scissors,
    solid: Scissors,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.BATCH,
    label: 'Batch',
    matchPaths: [APP_ROUTES.STUDIO.BATCH],
    outline: Layers,
    solid: Layers,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.FASTLANE,
    label: 'Fastlane',
    matchPaths: [APP_ROUTES.STUDIO.FASTLANE],
    outline: Zap,
    solid: Zap,
  },
  {
    // Remotion timeline. Path stays `/studio/edit` (Editor → Studio Edit surface);
    // label is "Edit" so nav matches the route segment users see in the URL.
    group: '',
    href: APP_ROUTES.STUDIO.EDIT,
    label: 'Edit',
    matchPaths: [APP_ROUTES.STUDIO.EDIT, APP_ROUTES.STUDIO.EDIT_NEW],
    outline: Film,
    solid: Film,
  },
];

export const STUDIO_LOGO_HREF = APP_ROUTES.STUDIO.STORYBOARD;
