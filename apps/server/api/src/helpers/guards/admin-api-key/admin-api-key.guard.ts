import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
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
 * Used for server-to-server communication where Clerk auth is not available
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
    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    // Validate against admin API key
    const adminApiKey = this.configService.get('GENFEEDAI_API_KEY');

    if (!adminApiKey) {
      this.logger.error('GENFEEDAI_API_KEY not configured');
      throw new UnauthorizedException('Server configuration error');
    }

    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(adminApiKey);
    if (
      tokenBuf.length !== keyBuf.length ||
      !timingSafeEqual(tokenBuf, keyBuf)
    ) {
      throw new UnauthorizedException('Invalid admin API key');
    }

    return true;
  }
}
