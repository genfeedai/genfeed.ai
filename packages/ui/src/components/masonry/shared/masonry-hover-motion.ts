/**
 * The hover motion every masonry tile shares: the media moves inside the
 * clipped frame (its parent is `overflow-hidden`), so the card itself stays
 * put. Scale covers the corners a 1.5deg tilt opens. The product motion policy
 * collapses every transition to ~0ms, so the moving element opts in with
 * `data-motion="allow"` (Vincent asked for the hover motion). Pair with an
 * ancestor `group/tile`.
 */
export const MASONRY_MEDIA_HOVER_CLASS =
  'transition-[opacity,scale,rotate] duration-500 ease-out motion-safe:group-hover/tile:scale-[1.08] motion-safe:group-hover/tile:-rotate-[1.5deg]';
