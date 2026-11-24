const WHITESPACE_RUN_PATTERN = /\s+/;

/** Reading speed behind every "N min read" label. */
export const ARTICLE_WORDS_PER_MINUTE = 200;

/** Whitespace-separated words of an article body; zero for an empty one. */
export function countArticleWords(content?: string | null): number {
  if (!content) {
    return 0;
  }
  return content.split(WHITESPACE_RUN_PATTERN).length;
}

/**
 * Whole minutes to read an article body. The public list drops `content` and
 * sends this number instead, so a card can still say "N min read".
 */
export function articleReadingTimeMinutes(content?: string | null): number {
  return Math.ceil(countArticleWords(content) / ARTICLE_WORDS_PER_MINUTE);
}
