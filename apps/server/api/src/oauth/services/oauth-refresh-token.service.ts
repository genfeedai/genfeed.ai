import { randomBytes } from 'node:crypto';
import { hashToken, toBase64Url } from '@api/auth/shared/pkce.util';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import {
  buildMcpOAuthSessionMetadata,
  readMcpOAuthSessionLineage,
} from '@api/oauth/mcp-oauth-session-metadata.util';
import { canonicalizeRequestedMcpResource } from '@api/oauth/oauth-metadata.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type McpAccessMode,
  mostRestrictiveMcpAccessMode,
} from '@genfeedai/actions';
import {
  ActionOrigin,
  ApiKeyCategory,
  ApiKeyScope,
} from '@genfeedai/contracts';
import {
  MCP_CLAUDE_SCOPE_CEILING,
  readApiKeyAllowedBrandIds,
} from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import type { McpOAuthRefreshToken, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { OAuthRevokeTokenDto } from '../dto/revoke-token.dto';
import type { OAuthRefreshTokenGrant } from '../dto/token-exchange.dto';
import { OAuthClientService } from './oauth-client.service';

const WHITESPACE_RUN_PATTERN = /\s+/;

/** Lifetime of the API key that backs an MCP OAuth access token. */
export const MCP_OAUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Lifetime of a refresh token; each rotation issues a fresh window. */
const MCP_OAUTH_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/**
 * A consumed refresh token presented again within this window by the same
 * client is a retry of a response that never arrived, not theft: the client
 * is given a fresh pair rotated from the live successor.
 */
export const MCP_OAUTH_REFRESH_GRACE_MS = 10_000;
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

type RotationInput = {
  accessMode: McpAccessMode;
  apiKey: ApiKeyDocument;
  claimed: McpOAuthRefreshToken;
  expiresAt: Date;
  grantedScopes: string[];
  lineage: ReturnType<typeof readMcpOAuthSessionLineage>;
  scopes: string[];
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

function buildTokenResponse(
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
 * the whole replacement chain (RFC 6819 §5.2.2.3), except that a retry by the
 * same client within MCP_OAUTH_REFRESH_GRACE_MS is answered from the live
 * successor, because the response to the first call may never have arrived.
 * Revoking the API key from settings invalidates the refresh token because
 * the key must not be revoked at refresh time (it may have expired: the
 * refresh token outlives it).
 */
@Traced()
@Injectable()
export class OAuthRefreshTokenService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly clientService: OAuthClientService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  /** Mint and persist a refresh token; the plaintext is returned exactly once. */
  async issue(
    input: IssueRefreshTokenInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<IssuedRefreshToken> {
    const refreshToken = toBase64Url(randomBytes(32));
    const record = await (
      transaction ?? this.prisma
    ).mcpOAuthRefreshToken.create({
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

  /**
   * Refresh and revocation come from clients that already completed an
   * authorization, so a metadata host outage must not lock them out.
   */
  private requireClientAllowingOutage(clientId: string) {
    return this.clientService.requireClient(clientId, undefined, {
      allowPersistedFallback: true,
    });
  }

  async refresh(dto: OAuthRefreshTokenGrant): Promise<McpOAuthTokenResponse> {
    await this.requireClientAllowingOutage(dto.client_id);

    let record = await this.prisma.mcpOAuthRefreshToken.findUnique({
      where: { tokenHash: hashToken(dto.refresh_token) },
    });
    if (!record || record.clientId !== dto.client_id) {
      throw invalidGrant();
    }
    if (record.consumedAt) {
      const successor = await this.findGraceSuccessor(record);
      if (!successor) {
        await this.markFamilyCompromised(record);
        throw invalidGrant();
      }
      this.logger.log('MCP OAuth refresh retried within the grace window', {
        clientId: record.clientId,
        organizationId: record.organizationId,
        refreshTokenId: record.id,
        userId: record.userId,
      });
      record = successor;
    }
    if (record.revokedAt || record.expiresAt <= new Date()) {
      throw invalidGrant();
    }
    if (
      dto.resource !== undefined &&
      canonicalizeRequestedMcpResource(dto.resource) !== record.resource
    ) {
      throw oauthError('invalid_target', 'Unsupported resource');
    }
    let scopes = this.narrowScopes(record.scopes, dto.scope);

    // The refresh token outlives its access key, so an expired key is
    // expected here; a revoked one is not.
    const apiKey = await this.apiKeysService.findUnrevokedById(record.apiKeyId);
    if (
      !apiKey ||
      apiKey.organizationId !== record.organizationId ||
      apiKey.userId !== record.userId
    ) {
      throw invalidGrant();
    }

    const lineage = readMcpOAuthSessionLineage(apiKey.metadata, apiKey.id);
    const accessMode = mostRestrictiveMcpAccessMode(
      lineage.accessMode,
      resolveMcpAccessModeForResource(record.resource),
    );
    const { grantedScopes, scopes: modeScopes } = this.limitScopesToAccessMode(
      accessMode,
      scopes,
      record.scopes,
    );
    scopes = modeScopes;

    // Claim, key rotation, replacement token and chain link commit together.
    // A failure anywhere rolls the claim back, so a transient error leaves the
    // client holding a token it can still present, not one burned as reuse.
    const expiresAt = new Date(Date.now() + MCP_OAUTH_SESSION_TTL_MS);
    const outcome = await this.rotateInTransaction({
      accessMode,
      apiKey,
      claimed: record,
      expiresAt,
      grantedScopes,
      lineage,
      scopes,
    });
    if (!outcome) {
      await this.markFamilyCompromised(record);
      throw invalidGrant();
    }
    const { replacement, rotated } = outcome;

    try {
      await this.apiKeysService.invalidateRotationCaches(
        record.organizationId,
        apiKey.id,
        rotated.apiKey.id,
      );
    } catch (error) {
      // Best effort: the rotation committed, and a cache failure must not
      // turn it into an error the client then retries as reuse.
      this.logger.error('Failed to invalidate API key caches after refresh', {
        apiKeyId: apiKey.id,
        error,
      });
    }

    // A concurrent loser that marked the family compromised before the
    // transaction committed has not seen the replacement; revoke it here.
    // One that walks the chain after the commit sees it and revokes it.
    const settled = await this.prisma.mcpOAuthRefreshToken.findFirst({
      where: {
        id: record.id,
        organizationId: record.organizationId,
        userId: record.userId,
      },
      select: { compromisedAt: true, revokedAt: true },
    });
    if (settled?.compromisedAt || settled?.revokedAt) {
      await this.revokeRefreshTokenById(
        replacement.id,
        record.organizationId,
        record.userId,
      );
      throw invalidGrant();
    }

    return buildTokenResponse(
      rotated.plainKey,
      rotated.apiKey.expiresAt ?? expiresAt,
      scopes,
      replacement.refreshToken,
    );
  }

  /** Returns null when another request claimed the token first. */
  private rotateInTransaction({
    accessMode,
    apiKey,
    claimed,
    expiresAt,
    grantedScopes,
    lineage,
    scopes,
  }: RotationInput): Promise<{
    replacement: IssuedRefreshToken;
    rotated: Awaited<ReturnType<ApiKeysService['rotateWithKey']>>;
  } | null> {
    return this.prisma.$transaction(async (transaction) => {
      // Single-use claim. Losing this race means another request presented the
      // same token concurrently, which is the same compromise the `consumedAt`
      // check above catches sequentially: both requests read the row before
      // either consumed it.
      const consumed = await transaction.mcpOAuthRefreshToken.updateMany({
        data: { consumedAt: new Date() },
        where: {
          clientId: claimed.clientId,
          consumedAt: null,
          id: claimed.id,
          organizationId: claimed.organizationId,
          revokedAt: null,
          userId: claimed.userId,
        },
      });
      if (consumed.count !== 1) {
        return null;
      }

      const rotated = await this.apiKeysService.rotateWithKey(
        apiKey.id,
        {
          // The brand chosen at consent, and the limit to it, survive every
          // rotation.
          allowedBrandIds: readApiKeyAllowedBrandIds(apiKey.metadata),
          category: ApiKeyCategory.GENFEEDAI,
          defaultBrandId: apiKey.defaultBrandId ?? undefined,
          description: 'OAuth session for a remote MCP client',
          expiresAt: expiresAt.toISOString(),
          label: 'MCP OAuth',
          // Keys minted before grant lineage existed fall back to their own
          // id, which then stays stable for every later rotation.
          metadata: buildMcpOAuthSessionMetadata(claimed.resource, {
            ...lineage,
            accessMode,
          }),
          organizationId: claimed.organizationId,
          rateLimit: apiKey.rateLimit ?? 120,
          scopes,
          userId: claimed.userId,
        },
        ActionOrigin.MCP,
        transaction,
      );
      // The grant itself is unchanged by a narrowed access-token request
      // (RFC 6749 §6), so the replacement stays bound to the consented scopes.
      const replacement = await this.issue(
        {
          apiKeyId: rotated.apiKey.id,
          clientId: claimed.clientId,
          organizationId: claimed.organizationId,
          resource: claimed.resource,
          scopes: grantedScopes,
          userId: claimed.userId,
        },
        transaction,
      );
      await transaction.mcpOAuthRefreshToken.updateMany({
        data: { replacedById: replacement.id },
        where: {
          id: claimed.id,
          organizationId: claimed.organizationId,
          userId: claimed.userId,
        },
      });
      return { replacement, rotated };
    });
  }

  /**
   * The live successor of a token consumed moments ago, or null when the
   * presentation is reuse. Reuse is anything outside the grace window, a token
   * revoked or already marked compromised, or a successor that has itself been
   * used or revoked.
   */
  private async findGraceSuccessor(
    consumed: McpOAuthRefreshToken,
  ): Promise<McpOAuthRefreshToken | null> {
    if (
      !consumed.consumedAt ||
      !consumed.replacedById ||
      consumed.revokedAt ||
      consumed.compromisedAt ||
      Date.now() - consumed.consumedAt.getTime() > MCP_OAUTH_REFRESH_GRACE_MS
    ) {
      return null;
    }
    return this.prisma.mcpOAuthRefreshToken.findFirst({
      where: {
        clientId: consumed.clientId,
        compromisedAt: null,
        consumedAt: null,
        id: consumed.replacedById,
        organizationId: consumed.organizationId,
        revokedAt: null,
        userId: consumed.userId,
      },
    });
  }

  /**
   * RFC 7009 revocation. Always resolves so the caller can answer 200 without
   * revealing whether the token existed or belonged to the client.
   */
  async revoke(dto: OAuthRevokeTokenDto): Promise<void> {
    await this.requireClientAllowingOutage(dto.client_id);

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

  /** Revoke one refresh token row and its API key, ignoring a missing row. */
  private async revokeRefreshTokenById(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const row = await this.prisma.mcpOAuthRefreshToken.findFirst({
      where: { id, organizationId, userId },
    });
    if (row) {
      await this.revokeRecord(row);
    }
  }

  /**
   * A refresh token was presented twice. Either the legitimate client
   * replayed it or the token leaked, and the two are indistinguishable, so
   * the whole rotation family is burned (RFC 6819 §5.2.2.3).
   *
   * `compromisedAt` is written before the chain is walked so that a
   * concurrent winner still mid-rotation observes it when it re-reads this
   * row after linking its replacement, and revokes what it issued.
   */
  private async markFamilyCompromised(
    record: McpOAuthRefreshToken,
  ): Promise<void> {
    this.logger.warn('MCP OAuth refresh token reuse detected', {
      clientId: record.clientId,
      organizationId: record.organizationId,
      refreshTokenId: record.id,
      userId: record.userId,
    });

    await this.prisma.mcpOAuthRefreshToken.updateMany({
      data: { compromisedAt: new Date() },
      where: {
        compromisedAt: null,
        id: record.id,
        organizationId: record.organizationId,
        userId: record.userId,
      },
    });
    await this.revokeRecord(record);

    const current = await this.prisma.mcpOAuthRefreshToken.findFirst({
      where: {
        id: record.id,
        organizationId: record.organizationId,
        userId: record.userId,
      },
      select: { replacedById: true },
    });
    let nextId = current?.replacedById ?? record.replacedById;
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

  /**
   * Claude connector sessions stay under the Claude ceiling. Only the admin
   * endpoint carries `admin`: a session consented on `/mcp` before that scope
   * moved there loses it on its next refresh and keeps everything else, and
   * reconnecting through the admin endpoint restores it.
   */
  private limitScopesToAccessMode(
    accessMode: McpAccessMode,
    scopes: string[],
    consentedScopes: string[],
  ): { grantedScopes: string[]; scopes: string[] } {
    const isAdmin = accessMode === 'admin';
    const isAllowed = (scope: string) =>
      (accessMode !== 'claude' || MCP_CLAUDE_SCOPE_CEILING.includes(scope)) &&
      (isAdmin || scope !== ApiKeyScope.ADMIN) &&
      (accessMode === 'standard' || scope !== ApiKeyScope.BRAND_KIT_WRITE);
    const limited = scopes.filter(isAllowed);
    if (
      limited.length === 0 &&
      (accessMode === 'claude' || scopes.length > 0)
    ) {
      throw oauthError('invalid_scope', 'No supported scopes remain');
    }
    return {
      grantedScopes: consentedScopes.filter(isAllowed),
      scopes: limited,
    };
  }

  private narrowScopes(granted: string[], requested?: string): string[] {
    if (requested === undefined) {
      return [...granted];
    }
    const scopes = Array.from(
      new Set(requested.split(WHITESPACE_RUN_PATTERN).filter(Boolean)),
    );
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
