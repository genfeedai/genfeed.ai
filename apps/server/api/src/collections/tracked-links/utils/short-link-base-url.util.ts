export const DEFAULT_SHORT_LINK_BASE_URL = 'https://go.genfeed.ai';

/** The host short links are served from, without a trailing slash. */
export function getShortLinkBaseUrl(): string {
  return (
    process.env.SHORT_LINK_BASE_URL || DEFAULT_SHORT_LINK_BASE_URL
  ).replace(/\/+$/, '');
}
