/** RFC 7523 JWT bearer grant, the grant enterprise-managed auth uses. */
export const JWT_BEARER_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:jwt-bearer';

/** `typ` header of an Identity Assertion JWT Authorization Grant (ID-JAG). */
export const ID_JAG_JWT_TYPE = 'oauth-id-jag+jwt';

/** Signature algorithms accepted on an assertion. */
export const ENTERPRISE_ASSERTION_ALGORITHMS = ['ES256', 'RS256'];

/** Clock skew allowed on `exp`, `nbf` and `iat`. */
export const ENTERPRISE_ASSERTION_SKEW_SECONDS = 60;

/** Longest `exp` window ahead of now an assertion may carry. */
export const ENTERPRISE_ASSERTION_MAX_LIFETIME_SECONDS = 60 * 60;

/**
 * Lifetime of the access token an assertion buys. There is no refresh token:
 * the client sends a fresh assertion when this runs out, so this bounds how
 * long a member removed from the IdP or the organization keeps access.
 */
export const MCP_ENTERPRISE_SESSION_TTL_MS = 60 * 60 * 1000;
