/**
 * X loads this exact URL inside the tweet. www.genfeed.ai redirects to the
 * apex, and a trailing slash on this site redirects, so neither belongs here.
 */
export const X_PLAYER_CARD_ORIGIN = 'https://genfeed.ai';
export const X_PLAYER_CARD_PATH = '/x/card';
export const X_PLAYER_CARD_URL = `${X_PLAYER_CARD_ORIGIN}${X_PLAYER_CARD_PATH}`;
export const X_PLAYER_WIDTH = 640;
export const X_PLAYER_HEIGHT = 480;

/**
 * Lets X embed this one response. A CSP host wildcard does not match the
 * apex, so both the bare host and the wildcard are required.
 */
export const X_PLAYER_FRAME_ANCESTORS =
  'frame-ancestors https://x.com https://*.x.com https://twitter.com https://*.twitter.com';
