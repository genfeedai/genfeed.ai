/**
 * The product's one focus treatment, as Tailwind classes. It paints exactly
 * `--focus-ring`: a 2px gap in the canvas colour, then a 2px monochrome ring.
 * The classes (not the raw token) are what controls use, so a consumer's
 * `focus-visible:ring-0` still merges it away through `cn`.
 */
export const focusRingClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * For controls clipped by an `overflow-hidden` parent or flush against a
 * neighbour (table cells, composite segments, full-bleed media links), where
 * an outer ring would be cut off.
 */
export const focusRingInsetClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';
