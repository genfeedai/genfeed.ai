/**
 * Stable `errors[0].code` the API sets on a 502 when HeyGen rejects the
 * organization's credentials. Clients branch on this code, never on the
 * HTTP status: a 401/403 from a provider must never reach the browser as an
 * auth status, because it would be read as the user's own session expiring.
 */
export const HEYGEN_CREDENTIALS_INVALID_ERROR_CODE =
  'HEYGEN_CREDENTIALS_INVALID';
