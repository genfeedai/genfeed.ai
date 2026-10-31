import type { OrganizationModuleId } from '@genfeedai/contracts/constants';
import type {
  AppCatalogCategoryId,
  AppCatalogPresentation,
} from '@/props/apps/organization-apps-page.props';

/** Categories in display order. */
export const APP_CATALOG_CATEGORY_IDS = [
  'create',
  'publish',
  'automate',
] as const satisfies readonly AppCatalogCategoryId[];

/**
 * Presentation per organization module, shared by Apps and the Modules
 * settings page: category and the designed thumbnail. Set
 * `thumbnailSrc` on an entry to swap its tile for real artwork; nothing else
 * changes. Publishing and Analytics are core apps, never listed in Apps.
 */
export const APP_CATALOG: Record<OrganizationModuleId, AppCatalogPresentation> =
  {
    analytics: {
      art: 'stats',
      category: 'publish',
      tone: 'primary',
    },
    automation: {
      thumbnailSrc: '/app-catalog/automation.webp',
      art: 'flow',
      category: 'automate',
      tone: 'info',
    },
    clipper: {
      thumbnailSrc: '/app-catalog/clipper.webp',
      art: 'trim',
      category: 'create',
      tone: 'warning',
    },
    discovery: {
      thumbnailSrc: '/app-catalog/discovery.webp',
      art: 'trend',
      category: 'publish',
      tone: 'success',
    },
    editor: {
      thumbnailSrc: '/app-catalog/editor.webp',
      art: 'timeline',
      category: 'create',
      tone: 'info',
    },
    messages: {
      thumbnailSrc: '/app-catalog/messages.webp',
      art: 'inbox',
      category: 'publish',
      tone: 'primary',
    },
    motion: {
      thumbnailSrc: '/app-catalog/motion.webp',
      art: 'motion',
      category: 'create',
      tone: 'warning',
    },
    publishing: {
      art: 'schedule',
      category: 'publish',
      tone: 'warning',
    },
    playground: {
      thumbnailSrc: '/app-catalog/playground.webp',
      art: 'prompt',
      category: 'create',
      tone: 'primary',
    },
    storyboard: {
      thumbnailSrc: '/app-catalog/storyboard.webp',
      art: 'frames',
      category: 'create',
      tone: 'success',
    },
    turbo: {
      thumbnailSrc: '/app-catalog/turbo.webp',
      art: 'layers',
      category: 'create',
      tone: 'info',
    },
  };
