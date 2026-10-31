import { INTERNAL_CALLERS_METADATA } from '@api/helpers/guards/admin-api-key/internal-callers.decorator';
import { parseAuthorizationHeader } from '@libs/auth/authorization-header';
import { isBearerTokenValid } from '@libs/auth/internal-api-key.guard';
import {
  type InternalCaller,
  resolveAcceptedInternalCallerKeys,
} from '@libs/auth/internal-caller-keys';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Guard that validates server-to-server requests on /v1/internal/* where
 * legacy auth provider auth is not available. A route declares which services
 * may call it with `@InternalCallers(...)`; the bearer token must be the key of
 * one of those services (`GENFEEDAI_API_KEY_<CALLER>`, or the shared
 * `GENFEEDAI_API_KEY` for a service that has no key of its own yet). A route
 * that declares no callers rejects everything.
 *
 * Unlike the internal-api-key guards (clips/images) this guard has NO
 * development-mode bypass and uses its own error messages — those
 * differences are intentional and preserved. The header parsing (strict
 * single scheme + single token, no surplus fields) and the timing-safe
 * comparison core are shared, via @libs/auth.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const parsed = parseAuthorizationHeader(authHeader);

    if (parsed?.normalizedScheme !== 'bearer') {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const token = parsed.token;

    const callers = this.reflector.getAllAndOverride<
      InternalCaller[] | undefined
    >(INTERNAL_CALLERS_METADATA, [context.getHandler(), context.getClass()]);

    if (!callers?.length) {
      this.logger.error('Route has no @InternalCallers declared');
      throw new UnauthorizedException('Server configuration error');
    }

    const acceptedKeys = resolveAcceptedInternalCallerKeys(
      (key) => this.configService.get(key),
      callers,
    );

    if (acceptedKeys.length === 0) {
      this.logger.error('No internal API key configured for route callers');
      throw new UnauthorizedException('Server configuration error');
    }

    // Compare against every accepted key so the time taken does not show
    // which caller's key matched.
    const isMatch = acceptedKeys
      .map((key) => isBearerTokenValid(token, key))
      .some(Boolean);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    return true;
  }
}
