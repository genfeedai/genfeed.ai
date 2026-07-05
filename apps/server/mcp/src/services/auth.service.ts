import { createHash } from 'node:crypto';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { resolveApiBaseUrl } from '@mcp/shared/utils/api-url.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export type McpRole = 'user' | 'admin' | 'superadmin';

export interface AuthResult {
  valid: boolean;
  userId?: string;
  organizationId?: string;
  role?: McpRole;
  error?: string;
}

/** Short-lived identity cache to avoid a /auth/whoami hop on every MCP call. */
const WHOAMI_CACHE_TTL_MS = 60_000;
const WHOAMI_CACHE_MAX = 5_000;

@Injectable()
export class AuthService {
  private readonly whoamiCache = new Map<
    string,
    { result: AuthResult; expiresAt: number }
  >();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  private cacheGet(key: string): AuthResult | null {
    const entry = this.whoamiCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.whoamiCache.delete(key);
      return null;
    }
    return entry.result;
  }

  private cacheSet(key: string, result: AuthResult): void {
    // Bounded LRU-ish: drop the oldest inserted key when at capacity.
    if (this.whoamiCache.size >= WHOAMI_CACHE_MAX) {
      const oldest = this.whoamiCache.keys().next().value;
      if (oldest !== undefined) this.whoamiCache.delete(oldest);
    }
    this.whoamiCache.set(key, {
      expiresAt: Date.now() + WHOAMI_CACHE_TTL_MS,
      result,
    });
  }

  async authenticateRequest(bearerToken: string): Promise<AuthResult> {
    try {
      if (!bearerToken || bearerToken.length < 32) {
        this.logger.warn('Invalid token format');
        return { error: 'Invalid token format', valid: false };
      }

      // Only successful resolutions are cached (never failures — a fixed token
      // must take effect immediately), keyed by a hash so raw tokens never sit
      // in memory as map keys.
      const cacheKey = createHash('sha256').update(bearerToken).digest('hex');
      const cached = this.cacheGet(cacheKey);
      if (cached) {
        return cached;
      }

      const baseUrl = resolveApiBaseUrl(
        this.configService.get('GENFEEDAI_API_URL') as string | undefined,
      );

      // Single identity endpoint for BOTH token types: the API's global
      // CombinedAuthGuard routes `gf_` keys to ApiKeyAuthGuard and Better Auth
      // session JWTs to BetterAuthGuard, then `/auth/whoami` returns the
      // resolved org/user/role for either.
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/auth/whoami`, {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
          timeout: 5000,
        }),
      );

      if (response.status === 200) {
        const data = response.data?.data ?? {};
        const organizationId: string | undefined = data.organization?.id;
        const userId: string | undefined = data.user?.id;

        if (!organizationId || !userId) {
          return {
            error: 'Token resolved but identity is incomplete',
            valid: false,
          };
        }

        const result: AuthResult = {
          organizationId,
          role: this.resolveRole(data.role),
          userId,
          valid: true,
        };
        this.cacheSet(cacheKey, result);
        return result;
      }

      return { error: 'Invalid token', valid: false };
    } catch (error: unknown) {
      const errorObj = error as {
        response?: { status?: number };
        message?: string;
      };

      if (errorObj?.response?.status === 401) {
        this.logger.warn('Invalid bearer token');
        return { error: 'Invalid bearer token', valid: false };
      }

      this.logger.error('Authentication check error:', errorObj.message);
      return {
        error: 'Auth service temporarily unavailable',
        valid: false,
      };
    }
  }

  /**
   * Map a Genfeed organization role key (`MemberRole`: owner | admin | creator
   * | analytics | user | support) to the coarse MCP role tier used for tool
   * gating. `owner` is the highest org role, so it must satisfy `admin`-gated
   * tools (otherwise org owners are denied every admin MCP tool).
   *
   * Anything unrecognised — including an empty string, which whoami returns when
   * the caller has no active membership (a removed member, or self-hosted
   * single-tenant where memberships aren't modelled) — maps to the `user` tier.
   * This is deliberate deny-by-default for the 14 admin-gated tools while still
   * permitting user-tier tools; the API independently re-enforces membership on
   * the actual calls, so a no-membership caller cannot mutate another org.
   */
  private resolveRole(role?: string): McpRole {
    if (role === 'superadmin') return 'superadmin';
    if (role === 'owner' || role === 'admin') return 'admin';
    return 'user';
  }

  static hasRequiredRole(userRole: McpRole, requiredRole: McpRole): boolean {
    const hierarchy: Record<McpRole, number> = {
      admin: 2,
      superadmin: 3,
      user: 1,
    };
    return hierarchy[userRole] >= hierarchy[requiredRole];
  }

  extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}
