/**
 * Default number of source-preview items retained per trend across the trend
 * source-item subsystem. Shared by the source-items and source-preview services
 * so the value cannot silently drift between them.
 */
export const TREND_SOURCE_PREVIEW_LIMIT = 5;

/**
 * The provider name on a trend whose source preview came from Instagram's
 * official hashtag search. Its preview is already stored, so no scraper is
 * asked to refill it.
 */
export const INSTAGRAM_HASHTAG_SEARCH_PROVIDER = 'instagram-hashtag-search';
