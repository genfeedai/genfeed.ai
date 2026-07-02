import { timingSafeEqual } from 'node:crypto';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Timing-safe comparison of a provided bearer token against a configured
 * secret. Returns `false` (never throws) so callers can decide how to
 * surface the failure — error messages differ per guard/service and must
 * stay observable-behavior-preserving.
 */
export function isBearerTokenValid(
  provided: string,
  configuredKey: string,
): boolean {
  if (!provided || !configuredKey) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(configuredKey);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Extracts a bearer token from an `Authorization: Bearer <token>` header
 * using `startsWith`/`slice` parsing (case-sensitive scheme, no whitespace
 * tolerance around the scheme). Returns `''` when the header is missing or
 * does not use the `Bearer ` scheme.
 *
 * This matches the parsing used by the clips/images internal API key guards.
 * `AdminApiKeyGuard` intentionally uses different (split-based) parsing and
 * does NOT use this helper — see admin-api-key.guard.ts.
 */
export function extractBearerTokenStrict(
  authHeader: string | undefined,
): string {
  const header = authHeader ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

export interface IInternalApiKeyGuardOptions {
  /** Returns the currently configured shared-secret API key (may be empty). */
  getConfiguredKey: () => string;
  /** Returns whether the service is running in development mode. */
  isDevelopment: () => boolean;
  /** Logger used for the dev-bypass warning. */
  logger: LoggerService;
  /** Message logged when the dev bypass is taken (service-specific wording). */
  devBypassLogMessage: string;
}

/**
 * Shared service-to-service auth guard for the internal HTTP surfaces
 * (clips, images, ...). Callers must present the same GENFEEDAI_API_KEY
 * bearer token these services use for outbound calls to the main API.
 *
 * Behavior (preserved verbatim from the original per-service guards):
 *  - No configured key + development mode → allow, log a warning.
 *  - No configured key + non-development → 401 "Service API key is not configured".
 *  - Missing/empty bearer token → 401 "Missing bearer token".
 *  - Mismatched token (timing-safe) → 401 "Invalid bearer token".
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly options: IInternalApiKeyGuardOptions) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.options.getConfiguredKey();

    if (!configuredKey) {
      if (this.options.isDevelopment()) {
        this.options.logger.warn(this.options.devBypassLogMessage);
        return true;
      }

      throw new UnauthorizedException('Service API key is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = extractBearerTokenStrict(request.headers.authorization);

    if (!provided) {
      throw new UnauthorizedException('Missing bearer token');
    }

    if (!isBearerTokenValid(provided, configuredKey)) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    return true;
  }
}
