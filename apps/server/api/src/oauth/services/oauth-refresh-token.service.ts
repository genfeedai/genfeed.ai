import { randomBytes } from 'node:crypto';
import { hashToken, toBase64Url } from '@api/auth/shared/pkce.util';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import type { McpOAuthRefreshToken } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { OAuthRevokeTokenDto } from '../dto/revoke-token.dto';
import type { OAuthRefreshTokenGrant } from '../dto/token-exchange.dto';
import { OAuthClientService } from './oauth-client.service';

/** Lifetime of the API key that backs an MCP OAuth access token. */
export const MCP_OAUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Lifetime of a refresh token; each rotation issues a fresh window. */
export const MCP_OAUTH_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Bound on the rotation chain walked during reuse detection. */
const MAX_REFRESH_CHAIN_DEPTH = 64;

export type McpOAuthTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: 'Bearer';
};

export type IssuedRefreshToken = {
  id: string;
  refreshToken: string;
};

export type IssueRefreshTokenInput = {
  apiKeyId: string;
  clientId: string;
  organizationId: string;
  resource: string;
  scopes: string[];
  userId: string;
};

function oauthError(error: string, description: string): BadRequestException {
  return new BadRequestException({
    error,
    error_description: description,
  });
}

function invalidGrant(): BadRequestException {
  return oauthError('invalid_grant', 'Invalid refresh token');
}

export function buildTokenResponse(
  plainKey: string,
  expiresAt: Date,
  scopes: string[],
  refreshToken: string,
): McpOAuthTokenResponse {
  return {
    access_token: plainKey,
    expires_in: Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    ),
    refresh_token: refreshToken,
    scope: scopes.join(' '),
    token_type: 'Bearer',
  };
}

/**
 * Refresh tokens for MCP OAuth sessions (#4553 phase 2).
 *
 * A refresh token is bound to the user, organization, client, resource and
 * scope grant of the access token (API key) it renews. Rotation is
 * single-use: presenting a consumed token is treated as theft and revokes
 * the whole replacement chain (RFC 6819 §5.2.2.3). Revoking the API key from
 * settings invalidates the refresh token because the key must still be active
 * at refresh time.
 */
@Injectable()
export class OAuthRefreshTokenService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly clientService: OAuthClientService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /** Mint and persist a refresh token; the plaintext is returned exactly once. */
  async issue(input: IssueRefreshTokenInput): Promise<IssuedRefreshToken> {
    const refreshToken = toBase64Url(randomBytes(32));
    const record = await this.prisma.mcpOAuthRefreshToken.create({
      data: {
        apiKeyId: input.apiKeyId,
        clientId: input.clientId,
        expiresAt: new Date(Date.now() + MCP_OAUTH_REFRESH_TOKEN_TTL_MS),
        organizationId: input.organizationId,
        resource: input.resource,
        scopes: input.scopes,
        tokenHash: hashToken(refreshToken),
        userId: input.userId,
      },
    });
    return { id: record.id, refreshToken };
  }

  async refresh(dto: OAuthRefreshTokenGrant): Promise<McpOAuthTokenResponse> {
    await this.clientService.requireClient(dto.client_id);

    const record = await this.prisma.mcpOAuthRefreshToken.findUnique({
      where: { tokenHash: hashToken(dto.refresh_token) },
    });
    if (!record || record.clientId !== dto.client_id) {
      throw invalidGrant();
    }
    if (record.consumedAt) {
      await this.revokeReplacementChain(record);
      throw invalidGrant();
    }
    if (record.revokedAt || record.expiresAt <= new Date()) {
      throw invalidGrant();
    }
    if (dto.resource !== undefined && dto.resource !== record.resource) {
      throw oauthError('invalid_target', 'Unsupported resource');
    }
    const scopes = this.narrowScopes(record.scopes, dto.scope);

    const apiKey = await this.apiKeysService.findActiveById(record.apiKeyId);
    if (
      !apiKey ||
      apiKey.organizationId !== record.organizationId ||
      apiKey.userId !== record.userId
    ) {
      throw invalidGrant();
    }

    const consumed = await this.prisma.mcpOAuthRefreshToken.updateMany({
      data: { consumedAt: new Date() },
      where: {
        clientId: record.clientId,
        consumedAt: null,
        id: record.id,
        organizationId: record.organizationId,
        revokedAt: null,
        userId: record.userId,
      },
    });
    if (consumed.count !== 1) {
      throw invalidGrant();
    }

    const expiresAt = new Date(Date.now() + MCP_OAUTH_SESSION_TTL_MS);
    const rotated = await this.apiKeysService.rotateWithKey(
      apiKey.id,
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
        rateLimit: apiKey.rateLimit ?? 120,
        scopes,
        userId: record.userId,
      },
      ActionOrigin.MCP,
    );

    // The grant itself is unchanged by a narrowed access-token request
    // (RFC 6749 §6), so the replacement stays bound to the consented scopes.
    const replacement = await this.issue({
      apiKeyId: rotated.apiKey.id,
      clientId: record.clientId,
      organizationId: record.organizationId,
      resource: record.resource,
      scopes: record.scopes,
      userId: record.userId,
    });
    await this.prisma.mcpOAuthRefreshToken.updateMany({
      data: { replacedById: replacement.id },
      where: {
        id: record.id,
        organizationId: record.organizationId,
        userId: record.userId,
      },
    });

    return buildTokenResponse(
      rotated.plainKey,
      rotated.apiKey.expiresAt ?? expiresAt,
      scopes,
      replacement.refreshToken,
    );
  }

  /**
   * RFC 7009 revocation. Always resolves so the caller can answer 200 without
   * revealing whether the token existed or belonged to the client.
   */
  async revoke(dto: OAuthRevokeTokenDto): Promise<void> {
    await this.clientService.requireClient(dto.client_id);

    // The hint only orders the lookups; RFC 7009 §2.1 says to fall back to
    // the other token type when the hinted one does not match.
    const lookups =
      dto.token_type_hint === 'access_token'
        ? [this.revokeAccessToken, this.revokeRefreshToken]
        : [this.revokeRefreshToken, this.revokeAccessToken];
    for (const lookup of lookups) {
      if (await lookup.call(this, dto)) {
        return;
      }
    }
  }

  /** Returns whether the token matched a refresh token (revoked or not). */
  private async revokeRefreshToken(dto: OAuthRevokeTokenDto): Promise<boolean> {
    const record = await this.prisma.mcpOAuthRefreshToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    if (!record) {
      return false;
    }
    if (record.clientId === dto.client_id) {
      await this.revokeRecord(record);
    }
    return true;
  }

  /** Returns whether the token matched an MCP OAuth session key. */
  private async revokeAccessToken(dto: OAuthRevokeTokenDto): Promise<boolean> {
    const apiKey = await this.apiKeysService.findByKey(dto.token);
    if (!apiKey || !this.apiKeysService.isMcpOAuthSession(apiKey)) {
      return false;
    }
    const linked = await this.prisma.mcpOAuthRefreshToken.findFirst({
      where: {
        apiKeyId: apiKey.id,
        clientId: dto.client_id,
        organizationId: apiKey.organizationId,
        userId: apiKey.userId,
      },
    });
    if (linked) {
      await this.revokeRecord(linked);
    }
    return true;
  }

  private async revokeRecord(record: McpOAuthRefreshToken): Promise<void> {
    await this.prisma.mcpOAuthRefreshToken.updateMany({
      data: { revokedAt: new Date() },
      where: {
        id: record.id,
        organizationId: record.organizationId,
        revokedAt: null,
        userId: record.userId,
      },
    });
    const apiKey = await this.apiKeysService.findActiveById(record.apiKeyId);
    if (
      apiKey &&
      apiKey.organizationId === record.organizationId &&
      apiKey.userId === record.userId
    ) {
      await this.apiKeysService.revoke(apiKey.id);
    }
  }

  /**
   * A consumed refresh token was presented again. Either the legitimate
   * client replayed it or the token leaked; revoke the token it was rotated
   * into and that token's API key so neither party keeps access.
   */
  private async revokeReplacementChain(
    record: McpOAuthRefreshToken,
  ): Promise<void> {
    this.logger.warn('MCP OAuth refresh token reuse detected', {
      clientId: record.clientId,
      organizationId: record.organizationId,
      refreshTokenId: record.id,
      userId: record.userId,
    });

    let nextId = record.replacedById;
    for (let depth = 0; nextId && depth < MAX_REFRESH_CHAIN_DEPTH; depth += 1) {
      const next = await this.prisma.mcpOAuthRefreshToken.findFirst({
        where: {
          id: nextId,
          organizationId: record.organizationId,
          userId: record.userId,
        },
      });
      if (!next) {
        return;
      }
      await this.revokeRecord(next);
      nextId = next.replacedById;
    }
  }

  private narrowScopes(granted: string[], requested?: string): string[] {
    if (requested === undefined) {
      return [...granted];
    }
    const scopes = Array.from(new Set(requested.split(/\s+/).filter(Boolean)));
    if (
      scopes.length === 0 ||
      scopes.some((scope) => !granted.includes(scope))
    ) {
      throw oauthError(
        'invalid_scope',
        'Requested scope exceeds the granted scope',
      );
    }
    return scopes;
  }
}
