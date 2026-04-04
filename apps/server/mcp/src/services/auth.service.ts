import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async authenticateRequest(bearerToken: string): Promise<AuthResult> {
    try {
      if (!bearerToken || bearerToken.length < 32) {
        this.logger.warn('Invalid token format');
        return { error: 'Invalid token format', valid: false };
      }

      const isApiKey = bearerToken.startsWith('gf_');
      const apiUrl = this.configService.get('GENFEEDAI_API_URL');

      if (isApiKey) {
        const response = await firstValueFrom(
          this.httpService.post(
            `${apiUrl}/api-keys/validate`,
            { key: bearerToken },
            { timeout: 5000 },
          ),
        );

        if (response.data?.valid === true) {
          return {
            organizationId: response.data?.organizationId,
            role: this.resolveRole(response.data?.role),
            userId: response.data?.userId,
            valid: true,
          };
        }

        return { error: 'Invalid API key', valid: false };
      }

      const response = await firstValueFrom(
        this.httpService.get(`${apiUrl}/accounts`, {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
          timeout: 5000,
        }),
      );

      if (response.status === 200) {
        const account = response.data?.data?.[0] || response.data?.data;
        return {
          organizationId:
            account?.attributes?.organization || account?.organizationId,
          role: this.resolveRole(account?.attributes?.role || account?.role),
          userId: account?.id || account?.attributes?.userId,
          valid: true,
        };
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

  private resolveRole(role?: string): McpRole {
    if (role === 'superadmin') return 'superadmin';
    if (role === 'admin') return 'admin';
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
