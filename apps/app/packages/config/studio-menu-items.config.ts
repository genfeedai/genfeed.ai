import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Clapperboard, Film, Layers, Scissors, Wand2 } from 'lucide-react';

/**
 * Flat nav under the Studio app chrome (no Edit / Automation subgroups) —
 * same shape as Automation and Library.
 *
 * Generate is the Studio home: one prompt bar for every asset type Genfeed can
 * make, brand-enriched, with the asset type as composer state rather than a
 * route segment. Editor is the Remotion timeline (route `/studio/editor`): the
 * finishing surface every video-producing Studio surface hands off to (#5461).
 *
 * Every entry stays inside `/studio` on purpose — a Studio menu item must never
 * hand the operator off to another module app.
 */
export const STUDIO_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.STUDIO.GENERATE,
    label: 'Generate',
    matchPaths: [APP_ROUTES.STUDIO.ROOT, APP_ROUTES.STUDIO.GENERATE],
    outline: Wand2,
    solid: Wand2,
  },
  {
    group: '',
    href: APP_ROUTES.STUDIO.STORYBOARD,
    label: 'Storyboard',
    matchPaths: [APP_ROUTES.STUDIO.STORYBOARD],
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
    matchPaths: [APP_ROUTES.STUDIO.BATCH, APP_ROUTES.STUDIO.BATCH_NEW],
    outline: Layers,
    solid: Layers,
  },

  {
    // Remotion timeline — the Studio finishing surface. The label matches the
    // `/studio/editor` route segment users see in the URL.
    group: '',
    href: APP_ROUTES.STUDIO.EDITOR,
    label: 'Editor',
    matchPaths: [APP_ROUTES.STUDIO.EDITOR, APP_ROUTES.STUDIO.EDITOR_NEW],
    outline: Film,
    solid: Film,
  },
];
