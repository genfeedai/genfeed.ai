import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { Clapperboard, Film, Layers, Scissors, Wand2, Zap } from 'lucide-react';

/**
 * Flat nav under the Studio app chrome (no Edit / Automation subgroups) —
 * same shape as Automation and Library.
 *
 * Generate is the Studio home: one prompt bar for every asset type Genfeed can
 * make, brand-enriched, with the asset type as composer state rather than a
 * route segment. Edit is the Remotion timeline (route `/studio/edit` from the
 * #2309 merge of the old top-level Editor app).
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
