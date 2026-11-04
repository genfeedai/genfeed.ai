import type { PlatformFlagKey } from './feature-flags.constant';

/**
 * The platform kill switch behind each organization module. Kept apart from
 * `organization-modules.constant.ts` so the app shell can resolve a native
 * app's switch without pulling in that file's zod schema, which would add it
 * to every route's first-load JavaScript.
 */
export const ORGANIZATION_MODULE_PLATFORM_FLAG_KEYS = {
  playground: 'studio',
  storyboard: 'storyboard',
  publishing: 'publishing',
  analytics: 'analytics',
  motion: 'motion',
  clipper: 'clipper',
  turbo: 'turbo',
  editor: 'editor',
  automation: 'automation',
  messages: 'messages',
  discovery: 'discovery',
} as const satisfies Record<string, PlatformFlagKey>;
