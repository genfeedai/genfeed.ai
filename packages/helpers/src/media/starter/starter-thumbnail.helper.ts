import { cdnAsset } from '../cdn/cdn.helper';

/** Creative apps whose starter cards carry an illustration. */
export type StarterThumbnailApp =
  | 'clipper'
  | 'editor'
  | 'motion'
  | 'storyboard'
  | 'turbo';

/**
 * The picture of what a starter makes: one 960x640 WebP per starter id on the
 * Genfeed CDN, in the app's own `starters/<app>/` folder (see `cdn.helper.ts`).
 * Playground's six starters live in `starters/playground/` and are listed with
 * their ideas.
 *
 * @example starterThumbnail('turbo', 'weeklyMix')
 *   → 'https://cdn.genfeed.ai/assets/starters/turbo/weeklyMix.webp'
 */
export function starterThumbnail(app: StarterThumbnailApp, id: string): string {
  return cdnAsset(`/assets/starters/${app}/${id}.webp`);
}
