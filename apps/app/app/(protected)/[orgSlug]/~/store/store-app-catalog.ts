import type { NativeSecondaryAppId } from '@genfeedai/contracts/constants';
import type {
  StoreAppCatalogEntry,
  StoreCategoryId,
} from '@genfeedai/props/store/organization-store-page.props';

/** Shelves in display order. */
export const STORE_CATEGORY_IDS = [
  'create',
  'publish',
  'automate',
] as const satisfies readonly StoreCategoryId[];

/**
 * Store-only presentation per native app: shelf, featured flag and the
 * designed thumbnail. Set `thumbnailSrc` on an entry to swap its tile for real
 * artwork; nothing else changes.
 */
export const STORE_APP_CATALOG: Record<
  NativeSecondaryAppId,
  StoreAppCatalogEntry
> = {
  automation: {
    thumbnailSrc: '/store/automation.webp',
    art: 'flow',
    category: 'automate',
    isFeatured: false,
    tone: 'info',
  },
  clips: {
    thumbnailSrc: '/store/clips.webp',
    art: 'trim',
    category: 'create',
    isFeatured: false,
    tone: 'warning',
  },
  discovery: {
    thumbnailSrc: '/store/discovery.webp',
    art: 'trend',
    category: 'publish',
    isFeatured: false,
    tone: 'success',
  },
  editor: {
    thumbnailSrc: '/store/editor.webp',
    art: 'timeline',
    category: 'create',
    isFeatured: false,
    tone: 'info',
  },
  messages: {
    thumbnailSrc: '/store/messages.webp',
    art: 'inbox',
    category: 'publish',
    isFeatured: false,
    tone: 'primary',
  },
  motion: {
    thumbnailSrc: '/store/motion.webp',
    art: 'motion',
    category: 'create',
    isFeatured: false,
    tone: 'warning',
  },
  playground: {
    thumbnailSrc: '/store/playground.webp',
    art: 'prompt',
    category: 'create',
    isFeatured: true,
    tone: 'primary',
  },
  storyboard: {
    thumbnailSrc: '/store/storyboard.webp',
    art: 'frames',
    category: 'create',
    isFeatured: true,
    tone: 'success',
  },
  turbo: {
    thumbnailSrc: '/store/turbo.webp',
    art: 'layers',
    category: 'create',
    isFeatured: true,
    tone: 'info',
  },
};
