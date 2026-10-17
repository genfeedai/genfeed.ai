import type { OrganizationModuleId } from '@genfeedai/contracts/constants';
import type {
  ExploreAppCatalogEntry,
  ExploreCategoryId,
} from '@genfeedai/props/explore/organization-explore-page.props';

/** Shelves in display order. */
export const STORE_CATEGORY_IDS = [
  'create',
  'publish',
  'automate',
] as const satisfies readonly ExploreCategoryId[];

/**
 * Presentation per organization module, shared by Explore and the Modules
 * settings page: shelf, featured flag and the designed thumbnail. Set
 * `thumbnailSrc` on an entry to swap its tile for real artwork; nothing else
 * changes. Publishing and Analytics are core apps, never listed in Explore.
 */
export const EXPLORE_APP_CATALOG: Record<
  OrganizationModuleId,
  ExploreAppCatalogEntry
> = {
  analytics: {
    art: 'stats',
    category: 'publish',
    isFeatured: false,
    tone: 'primary',
  },
  automation: {
    thumbnailSrc: '/explore/automation.webp',
    art: 'flow',
    category: 'automate',
    isFeatured: false,
    tone: 'info',
  },
  clips: {
    thumbnailSrc: '/explore/clips.webp',
    art: 'trim',
    category: 'create',
    isFeatured: false,
    tone: 'warning',
  },
  discovery: {
    thumbnailSrc: '/explore/discovery.webp',
    art: 'trend',
    category: 'publish',
    isFeatured: false,
    tone: 'success',
  },
  editor: {
    thumbnailSrc: '/explore/editor.webp',
    art: 'timeline',
    category: 'create',
    isFeatured: false,
    tone: 'info',
  },
  messages: {
    thumbnailSrc: '/explore/messages.webp',
    art: 'inbox',
    category: 'publish',
    isFeatured: false,
    tone: 'primary',
  },
  motion: {
    thumbnailSrc: '/explore/motion.webp',
    art: 'motion',
    category: 'create',
    isFeatured: false,
    tone: 'warning',
  },
  publishing: {
    art: 'schedule',
    category: 'publish',
    isFeatured: false,
    tone: 'warning',
  },
  playground: {
    thumbnailSrc: '/explore/playground.webp',
    art: 'prompt',
    category: 'create',
    isFeatured: true,
    tone: 'primary',
  },
  storyboard: {
    thumbnailSrc: '/explore/storyboard.webp',
    art: 'frames',
    category: 'create',
    isFeatured: true,
    tone: 'success',
  },
  turbo: {
    thumbnailSrc: '/explore/turbo.webp',
    art: 'layers',
    category: 'create',
    isFeatured: true,
    tone: 'info',
  },
};
