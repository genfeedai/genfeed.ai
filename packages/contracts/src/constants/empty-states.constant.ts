/**
 * Standardized empty state labels.
 *
 * Use `FOUND` variants for search/filter contexts ("No posts found").
 * Use `YET` variants for empty-but-can-add contexts ("No posts yet").
 */
export const EMPTY_STATES = {
  DEFAULT: 'No items found',
  MEMBERS_FOUND: 'No members found',
  POSTS_FOUND: 'No posts found',
  POSTS_PERIOD: 'No posts found for this period',
  POSTS_YET: 'No posts yet',
  RESULTS_FOUND: 'No results found',
  TAGS_YET: 'No tags yet',
} as const;
