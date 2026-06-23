import Joi from 'joi';

/**
 * Better Auth — first-party, self-hostable auth (Clerk replacement, epic #735).
 *
 * Phase 1 runs Better Auth **dual-run beside Clerk**, gated by
 * `BETTER_AUTH_ENABLED`. All keys are optional at the schema level so the API
 * boots cleanly while the flag is off; `BetterAuthModule` validates that the
 * required values are present when the flag is on (fail-fast at init, never at
 * request time). This keeps the env-coverage gate (#484/#731) green without
 * forcing every deployment to provision Better Auth before cutover.
 */
export const betterAuthSchema = {
  /**
   * Master dual-run switch. When `false` (default) the Better Auth handler,
   * strategy and guard are inert and every request flows through Clerk exactly
   * as before. Flip to `true` per-environment to light up first-party auth.
   */
  BETTER_AUTH_ENABLED: Joi.string()
    .valid('true', 'false')
    .optional()
    .default('false'),

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
   * Google OAuth credentials for the day-one social sign-in. Optional so the
   * provider is simply absent when unset; presence enables the Google button.
   */
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().optional().allow(''),
};
