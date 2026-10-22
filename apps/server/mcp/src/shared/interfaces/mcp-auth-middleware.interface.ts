import type { AuthService } from '@mcp/services/auth.service';
import type { RateLimitService } from '@mcp/services/rate-limit.service';

export interface McpAuthMiddlewareDependencies {
  authService: Pick<AuthService, 'extractBearerToken' | 'authenticateRequest'>;
  rateLimitService: Pick<RateLimitService, 'consume' | 'keyFor'>;
}
