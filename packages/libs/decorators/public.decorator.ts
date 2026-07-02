import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Shared `@Public()` route check. Reads the `IS_PUBLIC_KEY` metadata off the
 * handler and class, defaulting to `false` when the reflector or metadata is
 * unavailable. Used by every guard that needs to bypass auth for public
 * routes (CombinedAuthGuard, BetterAuthGuard, ...).
 */
export function isPublicRoute(
  reflector: Reflector | undefined,
  context: ExecutionContext,
): boolean {
  return (
    reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? false
  );
}
