/**
 * Recent-message window used for both thread hydration and hover prefetch.
 * Matches the server's default cursor page so initial paint stays bounded and
 * older history can be pulled incrementally as the user scrolls upward.
 */
export const AGENT_MESSAGE_PAGE_SIZE = 50;
