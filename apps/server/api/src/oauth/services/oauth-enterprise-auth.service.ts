import { createHash } from 'node:crypto';
import { hashToken } from '@api/auth/shared/pkce.util';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import {
  ENTERPRISE_ASSERTION_SKEW_SECONDS,
  JWT_BEARER_GRANT_TYPE,
  MCP_ENTERPRISE_SESSION_TTL_MS,
} from '@api/oauth/enterprise-managed-auth.constants';
import { buildMcpOAuthSessionMetadata } from '@api/oauth/mcp-oauth-session-metadata.util';
import {
  resolveAdvertisedMcpResource,
  resolveMcpResourceUrl,
  resolveOAuthIssuerUrl,
} from '@api/oauth/oauth-metadata.util';
import { clampMcpScopes } from '@api/oauth/oauth-scope.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { OAuthJwtBearerGrant } from '../dto/token-exchange.dto';
import {
  EnterpriseAssertionError,
  EnterpriseAssertionVerifier,
  type VerifiedEnterpriseAssertion,
} from './enterprise-assertion.verifier';
import { IssuerKeysError } from './enterprise-issuer-keys.service';
import { OAuthClientService } from './oauth-client.service';

export type EnterpriseTokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: 'Bearer';
};

const REPLAY_PRUNE_INTERVAL_MS = 60_000;

function oauthError(error: string, description: string): BadRequestException {
  return new BadRequestException({ error, error_description: description });
}

/** Every assertion failure reads the same to the caller (RFC 7523 §3). */
function invalidGrant(): BadRequestException {
  return oauthError('invalid_grant', 'Invalid assertion');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Enterprise-managed authorization: the jwt-bearer grant (RFC 7523) carrying
 * an ID-JAG. A signed identity assertion replaces the consent screen. The
 * signing issuer is the one an organization owner registered for their own
 * workspace, and the assertion only ever signs its member into that workspace.
 *
 * No refresh token is issued. Claude sends a fresh assertion when the access
 * token expires, so the session lifetime is the revocation bound.
 */
@Injectable()
export class OAuthEnterpriseAuthService {
  private lastReplayPruneAt = 0;

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly clientService: OAuthClientService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly verifier: EnterpriseAssertionVerifier,
  ) {}

  async exchange(dto: OAuthJwtBearerGrant): Promise<EnterpriseTokenResponse> {
    const client = await this.clientService.requireClient(dto.client_id);
    // Only a client document that declares the grant may use it. Dynamically
    // registered clients never do.
    if (!client.grantTypes.includes(JWT_BEARER_GRANT_TYPE)) {
      throw oauthError(
        'unauthorized_client',
        'This client may not use the jwt-bearer grant',
      );
    }
    const requestedResource = dto.resource
      ? resolveAdvertisedMcpResource(this.configService, dto.resource)
      : resolveMcpResourceUrl(this.configService);
    if (!requestedResource) {
      throw oauthError('invalid_target', 'Unsupported resource');
    }

    let assertion: VerifiedEnterpriseAssertion;
    let organizationId: string;
    try {
      const routing = this.verifier.peek(dto.assertion);
      organizationId = await this.resolveWorkspace(routing);
      assertion = await this.verifier.verify(dto.assertion, {
        audience: resolveOAuthIssuerUrl(this.configService),
        clientId: dto.client_id,
        issuer: routing.issuer,
      });
    } catch (error) {
      if (
        error instanceof EnterpriseAssertionError ||
        error instanceof IssuerKeysError
      ) {
        this.logger.warn('Enterprise assertion rejected', {
          clientId: dto.client_id,
          reason: error.message,
        });
        throw invalidGrant();
      }
      throw error;
    }

    // Every identifier the issuer scoped the assertion to must be one this
    // server protects, and the one the token is bound to must be among them.
    const resource = this.resolveGrantResource(requestedResource, assertion);

    const member = await this.resolveMember(organizationId, assertion.email);
    if (!member) {
      this.logger.warn('Enterprise assertion names no active member', {
        issuer: assertion.issuer,
        organizationId,
      });
      throw invalidGrant();
    }

    const scopes = clampMcpScopes(dto.scope ?? assertion.scope, resource);
    if (scopes.length === 0) {
      throw oauthError('invalid_scope', 'No supported scopes were requested');
    }

    await this.claimAssertion(assertion);

    const defaultBrandId = await this.resolveDefaultBrandId(
      organizationId,
      member.currentBrandId,
    );
    const expiresAt = new Date(Date.now() + MCP_ENTERPRISE_SESSION_TTL_MS);
    const { apiKey, plainKey } = await this.apiKeysService.createWithKey(
      {
        category: ApiKeyCategory.GENFEEDAI,
        defaultBrandId,
        description: 'Enterprise-managed session for a remote MCP client',
        expiresAt: expiresAt.toISOString(),
        label: 'MCP enterprise-managed',
        metadata: {
          ...buildMcpOAuthSessionMetadata(resource, {
            clientName: client.clientName,
            // Stable per member and client so a renewal reads as the same
            // connection, not a newly connected agent.
            grantId: this.grantId(organizationId, member.userId, dto.client_id),
          }),
          authMethod: 'enterprise-managed',
        },
        organizationId,
        rateLimit: 120,
        scopes,
        userId: member.userId,
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
      scope: scopes.join(' '),
      token_type: 'Bearer',
    };
  }

  /**
   * The one workspace whose registered issuer this assertion claims. A tenant
   * id (the organization id the admin pasted into the connector) names the
   * workspace directly; without one the issuer must belong to exactly one.
   */
  private async resolveWorkspace(routing: {
    audTenant?: string;
    issuer: string;
  }): Promise<string> {
    const configs = await this.prisma.mcpEnterpriseAuthConfig.findMany({
      select: { organizationId: true },
      take: 2,
      where: routing.audTenant
        ? {
            isEnabled: true,
            organizationId: routing.audTenant,
            trustedIssuer: routing.issuer,
          }
        : { isEnabled: true, trustedIssuer: routing.issuer },
    });
    const [config] = configs;
    // Zero workspaces trust the issuer, or several do and no tenant id says
    // which: refuse rather than guess.
    if (configs.length !== 1 || !config) {
      throw new EnterpriseAssertionError(
        configs.length === 0
          ? 'Issuer is not trusted by any workspace'
          : 'Issuer maps to several workspaces',
      );
    }
    const organization = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: config.organizationId, isDeleted: false },
    });
    if (!organization) {
      throw new EnterpriseAssertionError('Workspace is unavailable');
    }
    return organization.id;
  }

  private resolveGrantResource(
    requested: string,
    assertion: VerifiedEnterpriseAssertion,
  ): string {
    if (assertion.resources.length === 0) {
      return requested;
    }
    const governed = assertion.resources.map((candidate) =>
      resolveAdvertisedMcpResource(this.configService, candidate),
    );
    if (governed.some((candidate) => candidate === undefined)) {
      throw invalidGrant();
    }
    if (!governed.includes(requested)) {
      throw oauthError('invalid_target', 'Unsupported resource');
    }
    return requested;
  }

  /**
   * The active member of `organizationId` whose verified account has this
   * email (whole address, case-insensitive). No user is created: a person who
   * is not already a member is refused, whatever the issuer asserts.
   */
  private async resolveMember(
    organizationId: string,
    email: string,
  ): Promise<{ currentBrandId: string; userId: string } | undefined> {
    const members = await this.prisma.member.findMany({
      select: { currentBrandId: true, userId: true },
      take: 2,
      where: {
        isActive: true,
        isDeleted: false,
        organizationId,
        user: {
          banned: false,
          email: { equals: email, mode: 'insensitive' },
          emailVerified: true,
          isDeleted: false,
        },
      },
    });
    return members.length === 1 ? members[0] : undefined;
  }

  private async resolveDefaultBrandId(
    organizationId: string,
    brandId: string,
  ): Promise<string | undefined> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    return brand?.id;
  }

  /** Accept each `jti` once per issuer until it expires (plus skew). */
  private async claimAssertion(
    assertion: VerifiedEnterpriseAssertion,
  ): Promise<void> {
    const now = Date.now();
    if (now - this.lastReplayPruneAt >= REPLAY_PRUNE_INTERVAL_MS) {
      this.lastReplayPruneAt = now;
      // sql-risk-audit: ignore bulk-write-tenant-review -- Global TTL cleanup is restricted to expired one-time assertion ids.
      await this.prisma.mcpEnterpriseAuthAssertion.deleteMany({
        where: { expiresAt: { lte: new Date(now) } },
      });
    }
    try {
      await this.prisma.mcpEnterpriseAuthAssertion.create({
        data: {
          expiresAt: new Date(
            assertion.expiresAt.getTime() +
              ENTERPRISE_ASSERTION_SKEW_SECONDS * 1000,
          ),
          issuer: assertion.issuer,
          jtiHash: hashToken(assertion.jti),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.logger.warn('Enterprise assertion replay refused', {
          issuer: assertion.issuer,
        });
        throw invalidGrant();
      }
      throw error;
    }
  }

  private grantId(
    organizationId: string,
    userId: string,
    clientId: string,
  ): string {
    const digest = createHash('sha256')
      .update(`${organizationId}\n${userId}\n${clientId}`)
      .digest('hex');
    return `ema_${digest.slice(0, 24)}`;
  }
}
