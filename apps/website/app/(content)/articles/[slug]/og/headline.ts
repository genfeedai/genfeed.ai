/**
 * Headline fitting for the article social card.
 *
 * The card is 1200×630 with 72px padding, and the label pill and footer rule
 * claim roughly 112px of that between them — leaving the headline about 374px
 * of vertical room. Satori does not clip an oversized headline: it lets the
 * column overflow and pushes the footer out of the frame, so the brand mark
 * disappears with no other symptom. Everything here exists to make sure that
 * cannot happen for any input.
 */

/** Longest headline the card renders before it starts cutting words. */
export const HEADLINE_CAP = 150;

/**
 * Cuts an over-long headline back to the last whole word. Slicing mid-word
 * ("of qu…") reads as a rendering bug rather than an editorial choice. The
 * floor keeps a single unbroken 150-character token from collapsing the
 * headline to just an ellipsis.
 */
export function truncateHeadline(value: string, cap = HEADLINE_CAP): string {
  const characters = Array.from(value);

  if (characters.length <= cap) {
    return value;
  }

  const clipped = characters.slice(0, cap - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  const cut = lastSpace > cap * 0.6 ? clipped.slice(0, lastSpace) : clipped;

  return `${cut.join('').trimEnd()}…`;
}

/**
 * Steps the type down so the longest headline in each band still wraps inside
 * the space available. Verified by rendering the band maxima through satori —
 * the worst case (150 characters at 58px) lands on five lines and clears the
 * footer. Do not raise a step without re-rendering that band's maximum.
 */
export function getHeadlineSize(headline: string): number {
  const characterCount = Array.from(headline).length;

  if (characterCount > 96) {
    return 58;
  }

  if (characterCount > 72) {
    return 68;
  }

  if (characterCount > 48) {
    return 78;
  }

  return 92;
}
