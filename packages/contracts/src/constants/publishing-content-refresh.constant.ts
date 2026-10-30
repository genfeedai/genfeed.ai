/**
 * Dispatched on `window` when posts, articles, newsletters or releases changed
 * outside the Publishing page itself, for example when the agent drafts or
 * schedules a post. The Posts queue, the Calendar and the Overview reload.
 */
export const PUBLISHING_CONTENT_REFRESH_EVENT = 'publishing:content-refresh';
