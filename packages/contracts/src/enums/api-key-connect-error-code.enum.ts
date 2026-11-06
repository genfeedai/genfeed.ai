/**
 * Stable reason a key-based connect (`POST /services/{ghost,devto,beehiiv}/connect`)
 * failed, carried as the JSON:API error `code` so the connect form can say
 * which field to fix instead of one generic failure. Values are wire
 * contracts: never change or reuse them.
 */
export enum ApiKeyConnectErrorCode {
  /** The site URL is not a valid public web address. */
  INVALID_URL = 'API_KEY_CONNECT_INVALID_URL',
  /** The site URL uses http://; the key is only ever sent over https. */
  HTTPS_REQUIRED = 'API_KEY_CONNECT_HTTPS_REQUIRED',
  /** The key is not in the shape the provider issues (Ghost: `{id}:{secret}`). */
  INVALID_KEY_FORMAT = 'API_KEY_CONNECT_INVALID_KEY_FORMAT',
  /** DNS, connection, TLS or timeout failure: the site never answered. */
  SITE_UNREACHABLE = 'API_KEY_CONNECT_SITE_UNREACHABLE',
  /** The site answered, but not with the provider's API (wrong address). */
  API_NOT_FOUND = 'API_KEY_CONNECT_API_NOT_FOUND',
  /** The site redirects elsewhere; the form needs the final address. */
  SITE_REDIRECTED = 'API_KEY_CONNECT_SITE_REDIRECTED',
  /** The provider refused the key (401/403). */
  KEY_REJECTED = 'API_KEY_CONNECT_KEY_REJECTED',
  /** Beehiiv: the key works but sees no publication, or not the one asked for. */
  PUBLICATION_NOT_FOUND = 'API_KEY_CONNECT_PUBLICATION_NOT_FOUND',
  /** Unclassified failure. Diagnostics stay in the server log. */
  UNKNOWN = 'API_KEY_CONNECT_UNKNOWN',
}
