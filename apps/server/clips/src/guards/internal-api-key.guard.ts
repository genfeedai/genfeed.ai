import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@clips/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Service-to-service auth for the clips HTTP surface. Callers must present
 * the same GENFEEDAI_API_KEY bearer token the clips service itself uses for
 * outbound calls to the main API. Without this guard the endpoints were
 * fully unauthenticated and proxied into the API with a privileged key.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.configService.API_KEY;

    if (!configuredKey) {
      if (this.configService.isDevelopment) {
        this.logger.warn(
          'InternalApiKeyGuard GENFEEDAI_API_KEY not configured — allowing request in development',
        );
        return true;
      }

      throw new UnauthorizedException('Service API key is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization ?? '';
    const provided = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';

    if (!provided) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(configuredKey);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    return true;
  }
}
