import { metadata } from '@helpers/media/metadata/metadata.helper';

/**
 * Length budgets the SEO audit (`scripts/seo/seo-rules.ts`) enforces. The
 * description ceiling sits two characters under the audit's 160 so a trailing
 * full stop or a copy edit does not tip a page over.
 */
export const SEO_TITLE_MIN_LENGTH = 30;
export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MIN_LENGTH = 110;
export const SEO_DESCRIPTION_MAX_LENGTH = 158;

/** A page title that carries the brand, as the audit measures it. */
export function withBrandSuffix(title: string): string {
  return `${title} | ${metadata.name}`;
}

/**
 * Picks the first candidate that fits the description budget. Templated pages
 * pass their candidates from most specific to most generic, so a short data row
 * gets padded with a closing sentence and a long one is left alone. When none
 * fits, the last (most generic) candidate is returned.
 */
export function fitDescription(...candidates: string[]): string {
  const fits = candidates.find(
    (candidate) =>
      candidate.length >= SEO_DESCRIPTION_MIN_LENGTH &&
      candidate.length <= SEO_DESCRIPTION_MAX_LENGTH,
  );
  if (fits) {
    return fits;
  }

  // A copy edit that no candidate absorbs must not fail a production build; the
  // spec over every templated slug catches it before merge.
  return candidates[candidates.length - 1] ?? '';
}
