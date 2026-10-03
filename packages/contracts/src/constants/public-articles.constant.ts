/**
 * genfeed.ai serves articles (`/articles`, `/articles/:slug`, RSS, sitemap,
 * brand profiles) for exactly one organization: Genfeed's own. Customer
 * organizations can mark an article published, but it is never hosted on the
 * genfeed.ai website. Resolved by `Organization.slug`, which is unique.
 */
export const PUBLIC_ARTICLES_ORGANIZATION_SLUG = 'genfeed';

/** The public `/articles/:slug` segment: lowercase words joined by single hyphens. */
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ARTICLE_SLUG_MAX_LENGTH = 160;

/**
 * Folds any text (a title, or a model-suggested slug such as
 * `test-article-for-genfeed.ai`) into an `ARTICLE_SLUG_PATTERN` slug. Returns
 * an empty string when nothing usable remains.
 */
export function normalizeArticleSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, ARTICLE_SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
}
