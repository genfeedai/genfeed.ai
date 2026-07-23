import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  buildCodeChallenge,
  hashToken,
  safeEqual,
  toBase64Url,
} from '@api/auth/shared/pkce.util';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { OAuthAuthorizeDecisionDto } from '../dto/authorize-decision.dto';
import type { OAuthAuthorizeRequestDto } from '../dto/authorize-request.dto';
import type { OAuthTokenExchangeDto } from '../dto/token-exchange.dto';
import {
  resolveMcpResourceUrl,
  resolveOAuthAppUrl,
} from '../oauth-metadata.util';
import { OAuthClientService } from './oauth-client.service';

const MCP_OAUTH_CODE_TTL_MS = 60_000;
const MCP_OAUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type McpOAuthAuthCodeRecord = {
  clientId: string;
  codeChallenge: string;
  expiresAt: Date;
  id: string;
  organizationId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  usedAt: Date | null;
  userId: string;
};

function oauthError(error: string, description: string): BadRequestException {
  return new BadRequestException({
    error,
    error_description: description,
  });
}

function appendRedirectParams(
  redirectUri: string,
  params: Record<string, string>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

@Injectable()
export class OAuthAuthorizeService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly clientService: OAuthClientService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async buildAuthorizeRedirect(dto: OAuthAuthorizeRequestDto): Promise<string> {
    const client = await this.clientService.requireClient(
      dto.client_id,
      dto.redirect_uri,
    );
    this.assertResource(dto.resource);

    const consentUrl = new URL(
      '/oauth/consent',
      `${resolveOAuthAppUrl(this.configService)}/`,
    );
    for (const [key, value] of Object.entries(dto)) {
      if (typeof value === 'string') {
        consentUrl.searchParams.set(key, value);
      }
    }
    if (client.clientName) {
      consentUrl.searchParams.set('client_name', client.clientName);
    }
    return consentUrl.toString();
  }

  async decideAuthorization(
    user: User,
    dto: OAuthAuthorizeDecisionDto,
  ): Promise<{ redirectUrl: string }> {
    await this.clientService.requireClient(dto.client_id, dto.redirect_uri);
    this.assertResource(dto.resource);

    if (!dto.approved) {
      return {
        redirectUrl: appendRedirectParams(dto.redirect_uri, {
          error: 'access_denied',
          state: dto.state,
        }),
      };
    }

    const userId = user.publicMetadata?.user;
    const organizationId = user.publicMetadata?.organization;
    if (!userId || !organizationId) {
      throw new UnauthorizedException('User identity is incomplete');
    }

    const scopes = this.clampScopes(dto.scope);
    const code = toBase64Url(randomBytes(32));
    const expiresAt = new Date(Date.now() + MCP_OAUTH_CODE_TTL_MS);
    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    // sql-risk-audit: ignore bulk-write-tenant-review -- Global TTL cleanup is restricted to expired/consumed one-time OAuth codes.
    await this.prisma.mcpOAuthAuthCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: new Date() } }, { usedAt: { not: null } }],
      },
    });
    await this.prisma.mcpOAuthAuthCode.create({
      data: {
        clientId: dto.client_id,
        codeChallenge: dto.code_challenge,
        codeChallengeMethod: dto.code_challenge_method,
        codeHash: hashToken(code),
        expiresAt,
        organizationId,
        redirectUri: new URL(dto.redirect_uri).toString(),
        resource: dto.resource,
        scopes,
        stateHash: hashToken(dto.state),
        userEmail: user.emailAddresses?.[0]?.emailAddress || undefined,
        userId,
        userName: userName || undefined,
      },
    });

    return {
      redirectUrl: appendRedirectParams(dto.redirect_uri, {
        code,
        state: dto.state,
      }),
    };
  }

  async exchangeToken(dto: OAuthTokenExchangeDto) {
    await this.clientService.requireClient(dto.client_id);
    this.assertResource(dto.resource);

    const persisted = await this.prisma.mcpOAuthAuthCode.findUnique({
      where: { codeHash: hashToken(dto.code) },
    });
    if (!persisted) {
      throw oauthError('invalid_grant', 'Invalid authorization grant');
    }

    const record = persisted as McpOAuthAuthCodeRecord;
    const verifierChallenge = buildCodeChallenge(dto.code_verifier);
    const hasValidBinding =
      !record.usedAt &&
      record.expiresAt > new Date() &&
      record.clientId === dto.client_id &&
      record.redirectUri === new URL(dto.redirect_uri).toString() &&
      record.resource === dto.resource &&
      safeEqual(record.codeChallenge, verifierChallenge);
    if (!hasValidBinding) {
      throw oauthError('invalid_grant', 'Invalid authorization grant');
    }

    const consumeResult = await this.prisma.mcpOAuthAuthCode.updateMany({
      data: { usedAt: new Date() },
      where: {
        clientId: record.clientId,
        id: record.id,
        usedAt: null,
      },
    });
    if (consumeResult.count !== 1) {
      throw oauthError('invalid_grant', 'Invalid authorization grant');
    }

    const expiresAt = new Date(Date.now() + MCP_OAUTH_SESSION_TTL_MS);
    const { apiKey, plainKey } = await this.apiKeysService.createWithKey(
      {
        category: ApiKeyCategory.GENFEEDAI,
        description: 'OAuth session for a remote MCP client',
        expiresAt: expiresAt.toISOString(),
        label: 'MCP OAuth',
        metadata: {
          kind: 'mcp-oauth-session',
          resource: record.resource,
        },
        organizationId: record.organizationId,
        rateLimit: 120,
        scopes: record.scopes,
        userId: record.userId,
      },
      ActionOrigin.MCP,
    );
    const persistedExpiry = apiKey.expiresAt ?? expiresAt;

    return {
      access_token: plainKey,
      expires_in: Math.max(
        0,
        Math.floor((persistedExpiry.getTime() - Date.now()) / 1000),
      ),
      scope: record.scopes.join(' '),
      token_type: 'Bearer',
    };
  }

  private assertResource(resource: string): void {
    if (resource !== resolveMcpResourceUrl(this.configService)) {
      throw oauthError('invalid_target', 'Unsupported resource');
    }
  }

  private clampScopes(scope?: string): string[] {
    const ceiling = API_KEY_SCOPE_PRESETS.mcp as readonly string[];
    const requested = scope
      ? Array.from(new Set(scope.split(/\s+/).filter(Boolean)))
      : [...ceiling];
    const granted = requested.filter((candidate) =>
      ceiling.includes(candidate),
    );
    if (granted.length === 0) {
      throw oauthError('invalid_scope', 'No supported scopes were requested');
    }
    return granted;
  }
}
