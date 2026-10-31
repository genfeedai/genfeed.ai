/**
 * Seeded palette for the generated article cover.
 *
 * Articles rarely ship with a `coverImageUrl`, and a page that opens on a wall
 * of prose reads as unfinished. Rather than block on artwork that does not
 * exist, the cover is derived from the slug: the same article always renders
 * the same colours, different articles are visually distinct, and nothing has
 * to be uploaded first. The in-page band and the social card share this helper
 * so an article looks the same in a feed as it does on the site.
 */

export interface ArticleCoverPalette {
  /** Gradient origin — the darker end. */
  from: string;
  /** Gradient terminus — the lit end. */
  to: string;
  /** Hairlines, labels, and the pattern overlay. */
  accent: string;
  /** Page/card background behind the gradient. */
  base: string;
}

/**
 * FNV-1a. Chosen for being short, dependency-free, and stable across runtimes —
 * the social card is rendered by a different process than the page, and both
 * must land on the same hue for the same slug.
 */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function getArticleCoverPalette(seed: string): ArticleCoverPalette {
  const hash = hashSeed(seed || 'genfeed');
  const hue = hash % 360;
  // The companion hue stays adjacent rather than complementary: a wide split
  // turns the band into a rainbow smear at this size.
  const companionHue = (hue + 48) % 360;

  return {
    accent: `hsl(${hue} 82% 72%)`,
    base: 'hsl(0 0% 4%)',
    from: `hsl(${hue} 64% 14%)`,
    to: `hsl(${companionHue} 58% 26%)`,
  };
}
