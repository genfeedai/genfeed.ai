import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import { getMcpWwwAuthenticateHeader } from '@mcp/mcp/setup-page';
import { AuthService, type McpRole } from '@mcp/services/auth.service';
import {
  applyRateLimitHeaders,
  RateLimitService,
} from '@mcp/services/rate-limit.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const authHeader = request.headers.authorization;
    const token = this.authService.extractBearerToken(authHeader);

    // Same sliding window as the raw /mcp transport; keyed by hashed token
    // (or IP when absent) so both entry points share one budget per caller.
    const rateLimit = await this.rateLimitService.consume(
      this.rateLimitService.keyFor(token, request.ip),
    );
    applyRateLimitHeaders(response, rateLimit);
    if (!rateLimit.allowed) {
      throw new HttpException(
        `Rate limit exceeded. Retry after ${rateLimit.retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!token) {
      response.setHeader('WWW-Authenticate', getMcpWwwAuthenticateHeader());
      throw new UnauthorizedException(
        'Authorization header with Bearer token required',
      );
    }

    const authResult = await this.authService.authenticateRequest(token);

    if (!authResult.valid) {
      response.setHeader('WWW-Authenticate', getMcpWwwAuthenticateHeader());
      throw new UnauthorizedException(authResult.error || 'Invalid token');
    }

    request.authContext = {
      organizationId: authResult.organizationId,
      role: authResult.role || 'user',
      token,
      userId: authResult.userId,
    };

    return true;
  }

  static checkToolRole(
    userRole: McpRole,
    requiredRole: McpRole | undefined,
  ): void {
    if (!requiredRole) {
      throw new ForbiddenException(
        'Tool access denied: no role defined (deny-by-default)',
      );
    }
    if (!AuthService.hasRequiredRole(userRole, requiredRole)) {
      throw new ForbiddenException(
        `Tool requires '${requiredRole}' role, but user has '${userRole}'`,
      );
    }
  }
}
