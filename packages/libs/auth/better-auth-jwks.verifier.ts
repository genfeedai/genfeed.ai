import type {
  IBetterAuthJwksVerifierOptions,
  IBetterAuthVerifiedClaims,
} from '@genfeedai/interfaces';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Path the Better Auth jwt plugin publishes its JWKS at, relative to
 * `BETTER_AUTH_URL`. Mirrors `BETTER_AUTH_BASE_PATH` ('/v1/auth') in the API's
 * `better-auth.constants` — duplicated here so this shared lib carries no
 * app-layer import (epic #735, Phase 4 — D3).
 */
export const BETTER_AUTH_JWKS_PATH = '/v1/auth/jwks';

/** Normalizes the issuer/audience base URL to match the API JWT config. */
export function normalizeBetterAuthBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** Builds the JWKS URL from a Better Auth base URL, tolerating trailing slashes. */
export function resolveBetterAuthJwksUrl(baseUrl: string): string {
  return `${normalizeBetterAuthBaseUrl(baseUrl)}${BETTER_AUTH_JWKS_PATH}`;
}

export function createBetterAuthJwksVerifierOptions(
  baseUrl: string,
): IBetterAuthJwksVerifierOptions {
  const normalizedBaseUrl = normalizeBetterAuthBaseUrl(baseUrl);
  return {
    audience: normalizedBaseUrl,
    issuer: normalizedBaseUrl,
    jwksUrl: resolveBetterAuthJwksUrl(normalizedBaseUrl),
  };
}

/**
 * Verifies Better Auth-issued JWTs against the remote JWKS published by the jwt
 * plugin. First-party replacement for the Clerk `verifyToken` call the
 * websocket and terminal gateways used (epic #735, Phase 4 — D3).
 *
 * Construct one instance per JWKS URL: `jose`'s `createRemoteJWKSet` fetches and
 * caches the key set internally (with cooldown + rotation handling), so a single
 * long-lived verifier is reused across socket connections.
 */
export class BetterAuthJwksVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: IBetterAuthJwksVerifierOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUrl));
  }

  /**
   * Resolves the verified `sub` (the genfeed `User.id`). Throws when the token
   * fails signature/claims verification or carries no usable subject — callers
   * treat a throw as "unauthenticated".
   */
  async verify(token: string): Promise<IBetterAuthVerifiedClaims> {
    const { payload } = await jwtVerify(token, this.jwks, {
      audience: this.options.audience,
      issuer: this.options.issuer,
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Better Auth JWT is missing a subject (sub) claim');
    }

    return {
      organizationId:
        typeof payload.organizationId === 'string' &&
        payload.organizationId.length > 0
          ? payload.organizationId
          : undefined,
      sub: payload.sub,
    };
  }
}
