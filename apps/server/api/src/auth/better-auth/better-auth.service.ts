import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type CookieAttributes,
  parseSetCookieHeader,
  splitSetCookieHeader,
} from 'better-auth/cookies';
import { toNodeHandler } from 'better-auth/node';
import type { RequestHandler } from 'express';

import {
  BETTER_AUTH_BASE_PATH,
  BETTER_AUTH_INSTANCE,
} from './better-auth.constants';
import type { BetterAuthInstance } from './better-auth.factory';
import type {
  IBetterAuthJwtClaims,
  IDesktopSessionCookie,
  IDesktopSessionCookieResult,
} from './better-auth.types';

interface CachedClaims {
  claims: IBetterAuthJwtClaims;
  expiresAtMs: number;
}

interface DesktopSessionEndpointResponse {
  expiresAt: Date | string;
  token: string;
}

function resolveDesktopSessionCookieExpiresAt(
  attributes: CookieAttributes,
  fallback: Date | string,
): string {
  if (
    attributes.expires instanceof Date &&
    !Number.isNaN(attributes.expires.getTime())
  ) {
    return attributes.expires.toISOString();
  }

  const maxAge = attributes['max-age'];
  if (typeof maxAge === 'number' && Number.isFinite(maxAge)) {
    return new Date(Date.now() + maxAge * 1_000).toISOString();
  }

  const fallbackDate = fallback instanceof Date ? fallback : new Date(fallback);
  if (Number.isNaN(fallbackDate.getTime())) {
    throw new Error('Better Auth returned an invalid session expiry');
  }
  return fallbackDate.toISOString();
}

export function parseDesktopSessionCookie(
  headers: Headers,
  session: DesktopSessionEndpointResponse,
): IDesktopSessionCookie {
  const setCookieHeaders = splitSetCookieHeader(
    headers.get('set-cookie') ?? '',
  );

  for (const setCookieHeader of setCookieHeaders) {
    for (const [cookieName, attributes] of parseSetCookieHeader(
      setCookieHeader,
    )) {
      if (!attributes.value.startsWith(`${session.token}.`)) {
        continue;
      }

      return {
        cookieName,
        cookieValue: attributes.value,
        expiresAt: resolveDesktopSessionCookieExpiresAt(
          attributes,
          session.expiresAt,
        ),
        httpOnly: attributes.httponly ?? false,
        path: attributes.path ?? '/',
        sameSite: attributes.samesite ?? 'lax',
        secure: attributes.secure ?? false,
      };
    }
  }

  throw new Error('Better Auth did not emit a signed desktop session cookie');
}

// Verified-claims memoization: signature verification reads the JWKS table on
// every call, so repeat requests with the same bearer token each cost a DB
// round-trip plus crypto. Claims are immutable for a given token, so caching
// until min(60s, token exp) changes nothing semantically — verifyJWT never
// checks revocation, only signature + expiry.
const CLAIMS_CACHE_TTL_MS = 60_000;
const CLAIMS_CACHE_MAX_ENTRIES = 5_000;

/**
 * Thin wrapper around the constructed Better Auth instance (epic #735).
 *
 * Owns the node handler (mounted in `main.ts`) and in-process JWT verification
 * used by the Passport strategy. When the flag is off the injected instance is
 * `null` and every accessor degrades safely.
 */
@Injectable()
export class BetterAuthService {
  readonly basePath = BETTER_AUTH_BASE_PATH;
  private readonly handler: RequestHandler | null;
  private readonly claimsCache = new Map<string, CachedClaims>();

  constructor(
    @Inject(BETTER_AUTH_INSTANCE)
    private readonly instance: BetterAuthInstance | null,
  ) {
    this.handler = this.instance
      ? (toNodeHandler(this.instance) as unknown as RequestHandler)
      : null;
  }

  /** True only when the flag is on AND the instance was constructed. */
  get isEnabled(): boolean {
    return isBetterAuthEnabled() && this.instance !== null;
  }

  /** Express handler serving `${basePath}/*` (sign-in, magic-link, jwks, …). */
  get nodeHandler(): RequestHandler {
    if (!this.handler) {
      throw new Error('Better Auth handler requested while disabled');
    }
    return this.handler;
  }

  /** Mint the exact Better Auth cookie the desktop shell must install. */
  async createDesktopSessionCookie(
    userId: string,
  ): Promise<IDesktopSessionCookieResult | null> {
    if (!this.instance) {
      return null;
    }

    const result = await this.instance.api.createDesktopSession({
      body: { userId },
      returnHeaders: true,
    });

    return {
      cookie: parseDesktopSessionCookie(result.headers, result.response),
      token: result.response.token,
    };
  }

  /** Revoke a just-issued desktop session during compensating cleanup. */
  async revokeDesktopSession(token: string): Promise<void> {
    if (!this.instance) {
      return;
    }

    await this.instance.api.revokeDesktopSession({ body: { token } });
  }

  /**
   * Verify a Better Auth-issued JWT in-process (the API is the issuer) and
   * return its claims. Throws `UnauthorizedException` on any invalid token.
   */
  async verifyToken(token: string): Promise<IBetterAuthJwtClaims> {
    if (!this.instance) {
      throw new UnauthorizedException('Better Auth is not enabled');
    }

    const cached = this.claimsCache.get(token);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.claims;
    }
    if (cached) {
      this.claimsCache.delete(token);
    }

    let payload: Record<string, unknown> | null;
    try {
      const result = await this.instance.api.verifyJWT({ body: { token } });
      payload = result?.payload ?? null;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid token');
    }

    const claims = payload as unknown as IBetterAuthJwtClaims;
    this.cacheClaims(token, claims);
    return claims;
  }

  private cacheClaims(token: string, claims: IBetterAuthJwtClaims): void {
    const now = Date.now();
    const tokenExpMs =
      typeof claims.exp === 'number' ? claims.exp * 1_000 : now;
    const expiresAtMs = Math.min(now + CLAIMS_CACHE_TTL_MS, tokenExpMs);

    if (expiresAtMs <= now) {
      return;
    }

    if (this.claimsCache.size >= CLAIMS_CACHE_MAX_ENTRIES) {
      // Map iteration is insertion-ordered; dropping the oldest entry keeps
      // the cache bounded without tracking recency.
      const oldest = this.claimsCache.keys().next().value;
      if (oldest) {
        this.claimsCache.delete(oldest);
      }
    }

    this.claimsCache.set(token, { claims, expiresAtMs });
  }
}
