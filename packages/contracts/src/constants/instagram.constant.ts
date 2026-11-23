/**
 * Instagram allows one app user token to query at most 30 unique hashtags in
 * any rolling 7 days; a `top_media` or `recent_media` read counts as a query.
 *
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search
 */
export const INSTAGRAM_HASHTAG_WEEKLY_LIMIT = 30;

/** The rolling window the hashtag limit is counted over. */
export const INSTAGRAM_HASHTAG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Most hashtags one trend refresh spends, so a single refresh cannot drain the week. */
export const INSTAGRAM_HASHTAGS_PER_REFRESH = 5;
