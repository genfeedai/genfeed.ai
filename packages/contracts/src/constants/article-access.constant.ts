/**
 * Who can read an article in full (#9718). Everyone sees a `public` article.
 * A `paid` article shows its preview to everyone else; the creator's paying
 * subscribers read it in full, and other readers can unlock it once for its
 * unlock price when the creator sets one.
 */
export const ARTICLE_ACCESS_LEVELS = ['public', 'paid'] as const;

export type ArticleAccessLevel = (typeof ARTICLE_ACCESS_LEVELS)[number];

export function isArticleAccessLevel(
  value: unknown,
): value is ArticleAccessLevel {
  return (ARTICLE_ACCESS_LEVELS as readonly unknown[]).includes(value);
}

/** Bounds of a one-time article unlock price, in credits. */
export const ARTICLE_UNLOCK_MIN_PRICE = 1;
export const ARTICLE_UNLOCK_MAX_PRICE = 10_000;
