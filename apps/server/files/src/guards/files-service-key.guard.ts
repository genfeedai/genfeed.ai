import { ConfigService } from '@files/config/config.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import {
  FILES_SERVICE_KEY_HEADER,
  readFilesServiceKey,
} from '@libs/auth/files-service-key';
import { isBearerTokenValid } from '@libs/auth/internal-api-key.guard';
import { isPublicRoute } from '@libs/decorators/public.decorator';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { Request } from 'express';

const IS_SELF_HOSTED_BROWSER_ROUTE_KEY = 'isSelfHostedBrowserRoute';

/**
 * Marks a route the browser calls directly on a self-hosted install, where the
 * API hands the browser a files-service URL instead of a presigned S3 URL.
 * The route still requires the service key on Cloud.
 */
export const SelfHostedBrowserRoute = () =>
  SetMetadata(IS_SELF_HOSTED_BROWSER_ROUTE_KEY, true);

/**
 * App-wide service-to-service guard for the files service. Every route requires
 * the internal service key in `x-api-key`, except `@Public()` health routes and
 * self-hosted browser routes. It fails closed: with no key configured, every
 * protected route answers 503, except under `NODE_ENV=development` (like the
 * shared `InternalApiKeyGuard`), where `.env.example` leaves the key empty.
 * The self-hosted image always generates a key in its entrypoint.
 */
@Injectable()
export class FilesServiceKeyGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(this.reflector, context)) {
      return true;
    }

    if (isSelfHostedDeployment() && this.isSelfHostedBrowserRoute(context)) {
      return true;
    }

    const expected = readFilesServiceKey((key) => this.configService.get(key));
    if (!expected) {
      if (this.configService.isDevelopment) {
        return true;
      }

      throw new ServiceUnavailableException(
        'Files service authentication is not configured',
      );
    }

    const supplied = context.switchToHttp().getRequest<Request>().headers[
      FILES_SERVICE_KEY_HEADER
    ];
    if (
      typeof supplied !== 'string' ||
      !isBearerTokenValid(supplied, expected)
    ) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private isSelfHostedBrowserRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(
        IS_SELF_HOSTED_BROWSER_ROUTE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? false
    );
  }
}

/** Registers the guard for every route of the files app. */
export const FILES_SERVICE_KEY_GUARD_PROVIDER = {
  provide: APP_GUARD,
  useClass: FilesServiceKeyGuard,
};
