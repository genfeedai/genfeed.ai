import { IS_BETTER_AUTH_ENABLED } from '@genfeedai/config';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { RequestHandler } from 'express';

import {
  BETTER_AUTH_BASE_PATH,
  BETTER_AUTH_INSTANCE,
} from './better-auth.constants';
import type { BetterAuthInstance } from './better-auth.factory';
import type { IBetterAuthJwtClaims } from './better-auth.types';

/**
 * Thin wrapper around the constructed Better Auth instance (epic #735, #736).
 *
 * Owns the node handler (mounted in `main.ts`) and in-process JWT verification
 * used by the Passport strategy. When the dual-run flag is off the injected
 * instance is `null`, every accessor degrades safely, and the Clerk path is
 * entirely unaffected.
 */
@Injectable()
export class BetterAuthService {
  readonly basePath = BETTER_AUTH_BASE_PATH;
  private readonly handler: RequestHandler | null;

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
    return IS_BETTER_AUTH_ENABLED && this.instance !== null;
  }

  /** Express handler serving `${basePath}/*` (sign-in, magic-link, jwks, …). */
  get nodeHandler(): RequestHandler {
    if (!this.handler) {
      throw new Error('Better Auth handler requested while disabled');
    }
    return this.handler;
  }

  /**
   * Verify a Better Auth-issued JWT in-process (the API is the issuer) and
   * return its claims. Throws `UnauthorizedException` on any invalid token.
   */
  async verifyToken(token: string): Promise<IBetterAuthJwtClaims> {
    if (!this.instance) {
      throw new UnauthorizedException('Better Auth is not enabled');
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

    return payload as unknown as IBetterAuthJwtClaims;
  }
}
