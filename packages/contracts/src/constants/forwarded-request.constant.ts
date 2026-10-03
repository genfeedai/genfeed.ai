/**
 * RFC 7239 `Forwarded` element the app server sends on its own calls to the
 * API. `for=unknown` says the call acts for a client this hop does not name, so
 * the API never judges admin access on the app server's address.
 */
export const UNATTRIBUTED_FORWARDED_HEADER = 'forwarded';
export const UNATTRIBUTED_FORWARDED_VALUE = 'for=unknown';
