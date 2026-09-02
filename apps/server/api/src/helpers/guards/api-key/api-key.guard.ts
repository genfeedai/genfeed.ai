import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { RateLimitError } from '@api/helpers/exceptions/api/api-error.exception';
import { MCP_ACTION_ORIGIN_PROOF_HEADER } from '@genfeedai/contracts';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const API_KEY_SCOPES_KEY = 'apiKeyScopes';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private apiKeysService: ApiKeysService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('API key required');
    }

    // Support both "Bearer" and "ApiKey" prefixes
    const [type, key] = authHeader.split(' ');
    if (!key || (type !== 'Bearer' && type !== 'ApiKey')) {
      throw new UnauthorizedException('Invalid authorization format');
    }

    // Check if it's an API key (starts with gf_)
    if (!key.startsWith('gf_')) {
      // Not an API key, let other guards handle it
      return true;
    }

    const apiKey = await this.apiKeysService.findByKey(key);
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    if (
      this.apiKeysService.isMcpOAuthSession(apiKey) &&
      !this.apiKeysService.hasTrustedMcpOriginProof(
        request.headers[MCP_ACTION_ORIGIN_PROOF_HEADER],
      )
    ) {
      throw new UnauthorizedException(
        'MCP OAuth tokens are restricted to the MCP resource',
      );
    }

    // Check IP restriction
    const clientIp = request.ip || request.connection.remoteAddress;
    if (!this.apiKeysService.isIpAllowed(apiKey, clientIp)) {
      throw new UnauthorizedException('IP address not allowed');
    }

    // Check rate limit
    const rateLimit = await this.apiKeysService.checkRateLimit(apiKey);
    if (!rateLimit.allowed) {
      const response = context.switchToHttp().getResponse();
      response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      throw new RateLimitError(rateLimit.retryAfterSeconds);
    }

    // Check required scopes
    const requiredScopes = this.reflector.get<string[]>(
      API_KEY_SCOPES_KEY,
      context.getHandler(),
    );

    if (requiredScopes && requiredScopes.length > 0) {
      const hasRequiredScope = requiredScopes.some((scope) =>
        this.apiKeysService.hasScope(apiKey, scope),
      );

      if (!hasRequiredScope) {
        throw new UnauthorizedException('Insufficient permissions');
      }
    }

    const apiKeyId = apiKey.id;

    // Attach user info to request for downstream use
    request.user = {
      actionOrigin: this.apiKeysService.resolveActionOrigin(apiKey),
      apiKeyId,
      brandId: apiKey.organizationId,
      id: apiKey.userId,
      isApiKey: true,
      isSuperAdmin: false,
      organizationId: apiKey.organizationId,
      scopes: apiKey.scopes,
      userId: apiKey.userId,
    };

    // Update usage stats
    await this.apiKeysService.updateLastUsed(apiKeyId, clientIp);

    return true;
  }
}
