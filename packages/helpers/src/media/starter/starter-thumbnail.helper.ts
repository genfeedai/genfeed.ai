/** Creative apps whose starter cards carry an illustration. */
export type StarterThumbnailApp =
  | 'clipper'
  | 'editor'
  | 'motion'
  | 'storyboard'
  | 'turbo';

/**
 * Illustration of what a starter makes, one 3:2 WebP per starter id, served
 * from the web app's public folder. Playground's six starters keep their
 * generated photos on the CDN (see `cdnAsset`).
 *
 * @example starterThumbnail('turbo', 'weeklyMix')
 *   → '/starters/turbo/weeklyMix.webp'
 */
export function starterThumbnail(app: StarterThumbnailApp, id: string): string {
  return `/starters/${app}/${id}.webp`;
}
