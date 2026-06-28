import Joi from 'joi';

/**
 * Better Auth — first-party, self-hostable auth (legacy auth provider replacement, epic #735).
 *
 * Better Auth is the first-party runtime auth provider. The secret remains
 * optional at the schema level so local/offline services can boot without auth;
 * `BetterAuthModule` validates required values when the runtime is enabled.
 */
export const betterAuthSchema = {
  /**
   * Runtime switch. Enabled by default; set `false` only for explicit offline
   * local mode.
   */
  BETTER_AUTH_ENABLED: Joi.string()
    .valid('true', 'false')
    .optional()
    .default('true'),

  /**
   * Optional Better Auth Infrastructure dashboard key. When present, the API
   * enables the dash plugin so dash.better-auth.com can verify ownership.
   */
  BETTER_AUTH_API_KEY: Joi.string().optional().allow(''),

  /**
   * Signing secret for Better Auth sessions + JWTs. Required when enabled
   * (enforced in BetterAuthModule). Never falls back to a hardcoded value.
   */
  BETTER_AUTH_SECRET: Joi.string().optional().allow(''),

  /**
   * Public base URL Better Auth serves from (e.g. https://api.genfeed.ai). The
   * mounted handler lives under `${BETTER_AUTH_URL}/v1/auth/*`; the jwt plugin's
   * JWKS is published at `${BETTER_AUTH_URL}/v1/auth/jwks`. Defaults to the
   * configured API URL when omitted.
   */
  BETTER_AUTH_URL: Joi.string().uri().optional().allow(''),

  /**
   * Comma-separated origins allowed to initiate Better Auth flows / receive
   * redirects (web app, desktop deep-link, mobile). Optional.
   */
  BETTER_AUTH_TRUSTED_ORIGINS: Joi.string().optional().allow(''),

  /**
   * Root cookie domain (e.g. `.genfeed.ai`) for sharing the session cookie
   * across sibling subdomains (api ↔ app). Leave unset for single-host /
   * Community deployments so the cookie stays host-scoped.
   */
  BETTER_AUTH_COOKIE_DOMAIN: Joi.string().optional().allow(''),

  /**
   * Comma-separated client-IP headers Better Auth reads for rate limiting and
   * session tracking (e.g. `x-forwarded-for` behind the production ALB). Unset
   * keeps Better Auth's default detection for proxy-less / other edges.
   */
  BETTER_AUTH_IP_HEADERS: Joi.string().optional().allow(''),

  /**
   * Enable Better Auth's experimental single-query Prisma joins. Off by
   * default; flip per environment after staging verification.
   */
  BETTER_AUTH_EXPERIMENTAL_JOINS: Joi.string()
    .valid('true', 'false')
    .optional()
    .default('false'),

  /**
   * Google OAuth credentials for the day-one social sign-in. Optional so the
   * provider is simply absent when unset; presence enables the Google button.
   */
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().optional().allow(''),
};
