import {
  GENFEED_CORS_PREFLIGHT_MAX_AGE_SECONDS,
  type GenfeedCorsOptions,
} from '@libs/config/cors.config';
import type {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';

/**
 * OAuth endpoints a public client calls before it holds any credential:
 * dynamic registration (RFC 7591), token exchange and refresh (RFC 6749), and
 * revocation (RFC 7009). None read cookies, so they are safe to call from any
 * origin. `/oauth/authorize/decision` is deliberately absent: it carries the
 * user's session and stays on the credentialed allowlist.
 */
export const PUBLIC_OAUTH_CORS_PATHS: ReadonlySet<string> = new Set([
  '/v1/oauth/register',
  '/v1/oauth/revoke',
  '/v1/oauth/token',
]);

/**
 * A browser-based MCP client fetches the discovery documents cross-origin
 * (#4553 defect 4) and must then register and exchange its code the same way,
 * so these endpoints answer any origin — without credentials.
 */
export const PUBLIC_OAUTH_CORS_OPTIONS: CorsOptions = {
  credentials: false,
  maxAge: GENFEED_CORS_PREFLIGHT_MAX_AGE_SECONDS,
  methods: 'POST',
  origin: '*',
};

export function isPublicOAuthCorsPath(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const path = url.split('?')[0].replace(/\/+$/, '').toLowerCase();
  return PUBLIC_OAUTH_CORS_PATHS.has(path);
}

/** Routes public OAuth endpoints to wildcard CORS and everything else to `defaults`. */
export function buildApiCorsOptionsDelegate(
  defaults: GenfeedCorsOptions,
): CorsOptionsDelegate<Request> {
  return (request, callback) => {
    callback(
      null,
      isPublicOAuthCorsPath(request.url) ? PUBLIC_OAUTH_CORS_OPTIONS : defaults,
    );
  };
}
