/**
 * The website route the API calls to drop cached public pages at once, for
 * example after an operator takes work off community. Both sides hold the same
 * `WEBSITE_REVALIDATE_SECRET` and send or check it as a bearer token.
 */
export const WEBSITE_REVALIDATE_PATH = '/api/revalidate';
