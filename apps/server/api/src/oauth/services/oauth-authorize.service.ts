import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  buildCodeChallenge,
  hashToken,
  safeEqual,
  toBase64Url,
} from '@api/auth/shared/pkce.util';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { buildMcpOAuthSessionMetadata } from '@api/oauth/mcp-oauth-session-metadata.util';
import {
  resolveAdvertisedMcpResource,
  resolveOAuthAppUrl,
  resolveOAuthIssuerUrl,
} from '@api/oauth/oauth-metadata.util';
import { clampMcpScopes } from '@api/oauth/oauth-scope.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActionOrigin,
  ApiKeyCategory,
  ApiKeyScope,
  MemberRole,
} from '@genfeedai/contracts';
import { MCP_ADMIN_EMAIL_DOMAIN } from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { OAuthAuthorizeDecisionDto } from '../dto/authorize-decision.dto';
import type { OAuthAuthorizeRequestDto } from '../dto/authorize-request.dto';
import type { OAuthAuthorizationCodeGrant } from '../dto/token-exchange.dto';
import { OAuthClientService } from './oauth-client.service';
import {
  MCP_OAUTH_SESSION_TTL_MS,
  OAuthRefreshTokenService,
} from './oauth-refresh-token.service';

const MCP_OAUTH_CODE_TTL_MS = 60_000;

const ORGANIZATION_ADMIN_ROLE_KEYS: ReadonlySet<string> = new Set([
  MemberRole.OWNER,
  MemberRole.ADMIN,
]);

type McpOAuthAuthCodeRecord = {
  canSwitchOrganizations: boolean;
  clientId: string;
  codeChallenge: string;
  defaultBrandId: string | null;
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

/**
 * Append redirect parameters, skipping any that were not supplied. `state`
 * is echoed only when the client sent one (RFC 6749 §4.1.2); an absent value
 * must never surface as `state=undefined` or an empty `state=`.
 */
function appendRedirectParams(
  redirectUri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** A supplied `state` is echoed unchanged; a missing or empty one is absent. */
function suppliedState(state: string | undefined): string | undefined {
  return state ? state : undefined;
}

@Traced()
@Injectable()
export class OAuthAuthorizeService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly clientService: OAuthClientService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly refreshTokenService: OAuthRefreshTokenService,
  ) {}

  async buildAuthorizeRedirect(dto: OAuthAuthorizeRequestDto): Promise<string> {
    const client = await this.clientService.requireClient(
      dto.client_id,
      dto.redirect_uri,
    );
    const resource = this.assertResource(dto.resource);

    const consentUrl = new URL(
      '/oauth/consent',
      `${resolveOAuthAppUrl(this.configService)}/`,
    );
    for (const [key, value] of Object.entries(dto)) {
      if (typeof value === 'string') {
        consentUrl.searchParams.set(key, value);
      }
    }
    const accessMode = resolveMcpAccessModeForResource(resource);
    if (accessMode !== 'standard') {
      consentUrl.searchParams.set('access_mode', accessMode);
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
    const resource = this.assertResource(dto.resource);
    const state = suppliedState(dto.state);

    if (!dto.approved) {
      return {
        redirectUrl: appendRedirectParams(dto.redirect_uri, {
          error: 'access_denied',
          iss: resolveOAuthIssuerUrl(this.configService),
          state,
        }),
      };
    }

    const userId = user.userId;
    if (!userId) {
      throw new UnauthorizedException('User identity is incomplete');
    }

    // Discover only this canonical user's live memberships. Organization is
    // a root model, so this relation-filtered read does not inherit the active
    // request tenant or require a cross-organization bypass.
    const organizations = await this.prisma.organization.findMany({
      select: {
        id: true,
        members: {
          select: { role: { select: { key: true } } },
          where: { userId, isActive: true, isDeleted: false },
        },
      },
      orderBy: { createdAt: 'asc' },
      where: {
        isDeleted: false,
        members: { some: { userId, isActive: true, isDeleted: false } },
      },
    });
    // "All organizations" needs no starting choice: the connection begins in
    // the user's first organization and can name any other per call.
    const organizationId =
      dto.organizationId ??
      (organizations.length === 1 || dto.allowOrganizationSwitching === true
        ? organizations[0]?.id
        : undefined);
    const organization = organizations.find(
      (candidate) => candidate.id === organizationId,
    );
    if (!organizationId || !organization) {
      throw oauthError(
        'invalid_request',
        'Choose an organization where you have an active membership',
      );
    }

    if (dto.brandId && dto.allowOrganizationSwitching === true) {
      throw oauthError(
        'invalid_request',
        'A connection limited to one brand stays in that brand’s organization',
      );
    }
    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({
        select: { id: true },
        where: { id: dto.brandId, isDeleted: false, organizationId },
      });
      if (!brand) {
        throw oauthError(
          'invalid_request',
          'Choose a brand that belongs to the selected organization',
        );
      }
    }

    const isAdminResource =
      resolveMcpAccessModeForResource(resource) === 'admin';
    if (isAdminResource) {
      await this.assertAdminEndpointEligible(
        userId,
        organization.members.map((member) => member.role.key),
        Boolean(dto.brandId),
      );
    }
    const clampedScopes = this.clampScopes(dto.scope, resource);
    // The `admin` scope is issued on the admin endpoint only. It is never
    // requested, never inherited from the standard preset and never added to a
    // grant for any other resource.
    const scopes = isAdminResource
      ? [...clampedScopes, ApiKeyScope.ADMIN]
      : clampedScopes;
    // "All organizations": the connection may name any organization the user
    // belongs to on each call. Only meaningful with a second organization to
    // name. The Claude connector gets it too: its access mode stays `claude`
    // (no admin scope, no generation tools) whichever organization a call
    // acts in, and every switch re-checks live membership. The admin endpoint
    // stays in the one organization it was granted for.
    const canSwitchOrganizations =
      dto.allowOrganizationSwitching === true &&
      organizations.length > 1 &&
      !isAdminResource;
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
        canSwitchOrganizations,
        clientId: dto.client_id,
        codeChallenge: dto.code_challenge,
        codeChallengeMethod: dto.code_challenge_method,
        codeHash: hashToken(code),
        defaultBrandId: dto.brandId ?? null,
        expiresAt,
        organizationId,
        redirectUri: new URL(dto.redirect_uri).toString(),
        resource,
        scopes,
        stateHash: state ? hashToken(state) : null,
        userEmail: user.emailAddresses?.[0]?.emailAddress || undefined,
        userId,
        userName: userName || undefined,
      },
    });

    return {
      redirectUrl: appendRedirectParams(dto.redirect_uri, {
        code,
        iss: resolveOAuthIssuerUrl(this.configService),
        state,
      }),
    };
  }

  async exchangeToken(dto: OAuthAuthorizationCodeGrant) {
    const client = await this.clientService.requireClient(dto.client_id);
    const resource = this.assertResource(dto.resource);

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
      record.resource === resource &&
      safeEqual(record.codeChallenge, verifierChallenge);
    if (!hasValidBinding) {
      throw oauthError('invalid_grant', 'Invalid authorization grant');
    }

    const consumeResult = await this.prisma.mcpOAuthAuthCode.updateMany({
      data: { usedAt: new Date() },
      where: {
        clientId: record.clientId,
        id: record.id,
        organizationId: record.organizationId,
        usedAt: null,
        userId: record.userId,
      },
    });
    if (consumeResult.count !== 1) {
      throw oauthError('invalid_grant', 'Invalid authorization grant');
    }

    const expiresAt = new Date(Date.now() + MCP_OAUTH_SESSION_TTL_MS);
    const { apiKey, plainKey } = await this.apiKeysService.createWithKey(
      {
        // The brand picked at consent is the only brand this connection
        // reaches, and its default; no pick reaches every brand.
        ...(record.defaultBrandId
          ? { allowedBrandIds: [record.defaultBrandId] }
          : {}),
        category: ApiKeyCategory.GENFEEDAI,
        defaultBrandId: record.defaultBrandId ?? undefined,
        description: 'OAuth session for a remote MCP client',
        expiresAt: expiresAt.toISOString(),
        label: 'MCP OAuth',
        metadata: buildMcpOAuthSessionMetadata(record.resource, {
          canSwitchOrganizations: record.canSwitchOrganizations,
          clientName: client.clientName,
          grantId: record.id,
        }),
        organizationId: record.organizationId,
        rateLimit: 120,
        scopes: record.scopes,
        userId: record.userId,
      },
      ActionOrigin.MCP,
    );
    const persistedExpiry = apiKey.expiresAt ?? expiresAt;

    // The authorization code is already consumed, so a failure here would
    // strand a live key the client can never renew and cannot re-obtain
    // without a second consent. Revoke it instead of returning it.
    let refreshToken: string;
    try {
      ({ refreshToken } = await this.refreshTokenService.issue({
        apiKeyId: apiKey.id,
        clientId: record.clientId,
        organizationId: record.organizationId,
        resource: record.resource,
        scopes: record.scopes,
        userId: record.userId,
      }));
    } catch (error) {
      await this.refreshTokenService.revokeIssuedApiKey(apiKey.id);
      throw error;
    }

    return {
      access_token: plainKey,
      expires_in: Math.max(
        0,
        Math.floor((persistedExpiry.getTime() - Date.now()) / 1000),
      ),
      refresh_token: refreshToken,
      scope: record.scopes.join(' '),
      token_type: 'Bearer',
    };
  }

  /** Returns the canonical resource the grant is bound to. */
  private assertResource(requested: string): string {
    const resource = resolveAdvertisedMcpResource(
      this.configService,
      requested,
    );
    if (!resource) {
      throw oauthError('invalid_target', 'Unsupported resource');
    }
    return resource;
  }

  /**
   * The admin endpoint's `admin` scope unlocks owner/admin standing for the
   * connection, so consent is refused unless the signed-in account is a
   * verified `@genfeed.ai` account that is an owner or admin of the selected
   * organization. The scope only unlocks what the live membership already
   * allows: the role is still resolved from the current membership row, so a
   * demoted member's key stops being privileged. A connection limited to one
   * brand stays below it.
   */
  private async assertAdminEndpointEligible(
    userId: string,
    roleKeys: readonly string[],
    isBrandLimited: boolean,
  ): Promise<void> {
    const refusal = oauthError(
      'access_denied',
      'The admin connection is only for Genfeed staff who own or administer the selected organization',
    );
    if (
      isBrandLimited ||
      !roleKeys.some((key) => ORGANIZATION_ADMIN_ROLE_KEYS.has(key))
    ) {
      throw refusal;
    }
    const staffAccount = await this.prisma.user.findFirst({
      select: { id: true },
      where: {
        banned: false,
        email: {
          endsWith: `@${MCP_ADMIN_EMAIL_DOMAIN}`,
          mode: 'insensitive',
        },
        emailVerified: true,
        id: userId,
        isDeleted: false,
      },
    });
    if (!staffAccount) {
      throw refusal;
    }
  }

  private clampScopes(scope: string | undefined, resource: string): string[] {
    const granted = clampMcpScopes(scope, resource);
    if (granted.length === 0) {
      throw oauthError('invalid_scope', 'No supported scopes were requested');
    }
    return granted;
  }
}
