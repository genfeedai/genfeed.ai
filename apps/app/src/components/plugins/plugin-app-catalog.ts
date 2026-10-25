import type { OrganizationModuleId } from '@genfeedai/contracts/constants';
import type {
  PluginAppCatalogEntry,
  PluginCategoryId,
} from '@genfeedai/props/plugins/organization-plugins-page.props';

/** Categories in display order. */
export const PLUGIN_CATEGORY_IDS = [
  'create',
  'publish',
  'automate',
] as const satisfies readonly PluginCategoryId[];

/**
 * Presentation per organization module, shared by Plugins and the Modules
 * settings page: category and the designed thumbnail. Set
 * `thumbnailSrc` on an entry to swap its tile for real artwork; nothing else
 * changes. Publishing and Analytics are core apps, never listed in Plugins.
 */
export const PLUGIN_APP_CATALOG: Record<
  OrganizationModuleId,
  PluginAppCatalogEntry
> = {
  analytics: {
    art: 'stats',
    category: 'publish',
    tone: 'primary',
  },
  automation: {
    thumbnailSrc: '/plugins/automation.webp',
    art: 'flow',
    category: 'automate',
    tone: 'info',
  },
  clipper: {
    thumbnailSrc: '/plugins/clipper.webp',
    art: 'trim',
    category: 'create',
    tone: 'warning',
  },
  discovery: {
    thumbnailSrc: '/plugins/discovery.webp',
    art: 'trend',
    category: 'publish',
    tone: 'success',
  },
  editor: {
    thumbnailSrc: '/plugins/editor.webp',
    art: 'timeline',
    category: 'create',
    tone: 'info',
  },
  messages: {
    thumbnailSrc: '/plugins/messages.webp',
    art: 'inbox',
    category: 'publish',
    tone: 'primary',
  },
  motion: {
    thumbnailSrc: '/plugins/motion.webp',
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
    thumbnailSrc: '/plugins/playground.webp',
    art: 'prompt',
    category: 'create',
    tone: 'primary',
  },
  storyboard: {
    thumbnailSrc: '/plugins/storyboard.webp',
    art: 'frames',
    category: 'create',
    tone: 'success',
  },
  turbo: {
    thumbnailSrc: '/plugins/turbo.webp',
    art: 'layers',
    category: 'create',
    tone: 'info',
  },
};
