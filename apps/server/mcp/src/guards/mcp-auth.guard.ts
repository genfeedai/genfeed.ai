import { AuthService, type McpRole } from '@mcp/services/auth.service';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(PUBLIC_KEY, true);

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const token = this.authService.extractBearerToken(authHeader);

    if (!token) {
      throw new UnauthorizedException(
        'Authorization header with Bearer token required',
      );
    }

    const authResult = await this.authService.authenticateRequest(token);

    if (!authResult.valid) {
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
