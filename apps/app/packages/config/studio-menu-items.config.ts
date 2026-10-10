import { APP_DISPLAY_LABELS, APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  AppContext,
  MenuItemConfig,
} from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  Clapperboard,
  Film,
  Layers,
  Scissors,
  Sparkles,
  Wand2,
} from 'lucide-react';

/**
 * Studio tools are separate apps (#5502): each owns its `/studio/<tool>`
 * routes and its own nav column, and none lists the others. There is no
 * Studio parent; members reach the next tool from the Apps launcher.
 */
export const STUDIO_APP_IDS = [
  'playground',
  'storyboard',
  'turbo',
  'motion',
  'clips',
  'editor',
] as const satisfies readonly AppContext[];

export type StudioAppId = (typeof STUDIO_APP_IDS)[number];

export const STUDIO_APP_MENU_ITEMS: Readonly<
  Record<StudioAppId, readonly MenuItemConfig[]>
> = {
  playground: [
    {
      group: '',
      href: APP_ROUTES.STUDIO.PLAYGROUND,
      label: APP_DISPLAY_LABELS.playground,
      organizationModule: 'playground',
      matchPaths: [APP_ROUTES.STUDIO.PLAYGROUND],
      outline: Wand2,
      solid: Wand2,
    },
  ],
  storyboard: [
    {
      group: '',
      href: APP_ROUTES.STUDIO.STORYBOARD,
      label: APP_DISPLAY_LABELS.storyboard,
      organizationModule: 'storyboard',
      matchPaths: [
        APP_ROUTES.STUDIO.STORYBOARD,
        APP_ROUTES.STUDIO.STORYBOARD_NEW,
      ],
      outline: Clapperboard,
      solid: Clapperboard,
    },
  ],
  // Turbo runs on the Batch surface until #5936 renames its routes.
  turbo: [
    {
      group: '',
      href: APP_ROUTES.STUDIO.BATCH,
      label: APP_DISPLAY_LABELS.turbo,
      organizationModule: 'batch',
      matchPaths: [APP_ROUTES.STUDIO.BATCH, APP_ROUTES.STUDIO.BATCH_NEW],
      outline: Layers,
      solid: Layers,
    },
  ],
  motion: [
    {
      group: '',
      href: APP_ROUTES.STUDIO.MOTION,
      label: APP_DISPLAY_LABELS.motion,
      organizationModule: 'motion',
      matchPaths: [APP_ROUTES.STUDIO.MOTION],
      outline: Sparkles,
      solid: Sparkles,
    },
  ],
  clips: [
    {
      group: '',
      href: APP_ROUTES.STUDIO.CLIPS,
      label: APP_DISPLAY_LABELS.clips,
      organizationModule: 'clips',
      matchPaths: [APP_ROUTES.STUDIO.CLIPS, APP_ROUTES.STUDIO.CLIPS_NEW],
      outline: Scissors,
      solid: Scissors,
    },
  ],
  // The Remotion timeline, the finishing surface video apps hand off to.
  editor: [
    {
      group: '',
      href: APP_ROUTES.STUDIO.EDITOR,
      label: APP_DISPLAY_LABELS.editor,
      organizationModule: 'editor',
      matchPaths: [APP_ROUTES.STUDIO.EDITOR, APP_ROUTES.STUDIO.EDITOR_NEW],
      outline: Film,
      solid: Film,
    },
  ],
};

const STUDIO_APP_ROOTS: Readonly<Record<StudioAppId, string>> = {
  clips: APP_ROUTES.STUDIO.CLIPS,
  editor: APP_ROUTES.STUDIO.EDITOR,
  motion: APP_ROUTES.STUDIO.MOTION,
  playground: APP_ROUTES.STUDIO.PLAYGROUND,
  storyboard: APP_ROUTES.STUDIO.STORYBOARD,
  turbo: APP_ROUTES.STUDIO.BATCH,
};

/** The Studio app that owns a product path such as `/studio/clips/new`. */
export function getStudioAppForPath(
  productPath: string,
): StudioAppId | undefined {
  return STUDIO_APP_IDS.find((appId) => {
    const root = STUDIO_APP_ROOTS[appId];
    return productPath === root || productPath.startsWith(`${root}/`);
  });
}
