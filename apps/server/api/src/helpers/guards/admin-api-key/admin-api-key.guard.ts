import { parseAuthorizationHeader } from '@libs/auth/authorization-header';
import { isBearerTokenValid } from '@libs/auth/internal-api-key.guard';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Guard that validates requests using the admin API key
 * Used for server-to-server communication where legacy auth provider auth is not available
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
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    // Extract token from Bearer header
    const parsed = parseAuthorizationHeader(authHeader);

    if (parsed?.normalizedScheme !== 'bearer') {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const token = parsed.token;

    // Validate against admin API key
    const adminApiKey = this.configService.get('GENFEEDAI_API_KEY');

    if (!adminApiKey) {
      this.logger.error('GENFEEDAI_API_KEY not configured');
      throw new UnauthorizedException('Server configuration error');
    }

    if (!isBearerTokenValid(token, adminApiKey)) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    return true;
  }
}
