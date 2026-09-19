import 'reflect-metadata';

import { hashToken } from '@api/auth/shared/pkce.util';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OAuthRevokeTokenDto } from '../dto/revoke-token.dto';
import {
  type OAuthRefreshTokenGrant,
  OAuthTokenExchangeDto,
} from '../dto/token-exchange.dto';
import type {
  OAuthClientRecord,
  OAuthClientService,
} from './oauth-client.service';
import { OAuthRefreshTokenService } from './oauth-refresh-token.service';

const clientId = 'oauth_client_123';
const otherClientId = 'oauth_client_456';
const resource = 'https://mcp.genfeed.ai/mcp';
const grantedScopes = ['videos:read', 'images:read'];

type RefreshTokenRow = {
  apiKeyId: string;
  clientId: string;
  consumedAt: Date | null;
  expiresAt: Date;
  id: string;
  organizationId: string;
  replacedById: string | null;
  resource: string;
  revokedAt: Date | null;
  scopes: string[];
  tokenHash: string;
  userId: string;
};

type ApiKeyRow = {
  expiresAt: Date | null;
  id: string;
  isRevoked: boolean;
  metadata: Record<string, unknown>;
  organizationId: string;
  rateLimit: number | null;
  scopes: string[];
  userId: string;
};

function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function buildHarness() {
  const refreshTokens = new Map<string, RefreshTokenRow>();
  const apiKeys = new Map<string, ApiKeyRow>();
  let keySequence = 0;
  let refreshSequence = 0;

  function seedApiKey(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
    keySequence += 1;
    const row: ApiKeyRow = {
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      id: `key-${keySequence}`,
      isRevoked: false,
      metadata: { kind: 'mcp-oauth-session', resource },
      organizationId: 'org-1',
      rateLimit: 120,
      scopes: [...grantedScopes],
      userId: 'user-1',
      ...overrides,
    };
    apiKeys.set(row.id, row);
    return row;
  }

  function seedRefreshToken(
    plain: string,
    overrides: Partial<RefreshTokenRow> = {},
  ): RefreshTokenRow {
    refreshSequence += 1;
    const row: RefreshTokenRow = {
      apiKeyId: 'key-1',
      clientId,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      id: `refresh-${refreshSequence}`,
      organizationId: 'org-1',
      replacedById: null,
      resource,
      revokedAt: null,
      scopes: [...grantedScopes],
      tokenHash: hashToken(plain),
      userId: 'user-1',
      ...overrides,
    };
    refreshTokens.set(row.tokenHash, row);
    return row;
  }

  const apiKeysService = {
    findActiveById: vi.fn(async (id: string) => {
      const row = apiKeys.get(id);
      if (!row || row.isRevoked) return null;
      if (row.expiresAt && row.expiresAt <= new Date()) return null;
      return row;
    }),
    findByKey: vi.fn(async (plainKey: string) => {
      const match = plainKey.match(/^gf_test_(key-\d+)$/);
      const row = match ? apiKeys.get(match[1]) : undefined;
      return row && !row.isRevoked ? row : null;
    }),
    isMcpOAuthSession: vi.fn(
      (row: ApiKeyRow) => row.metadata.kind === 'mcp-oauth-session',
    ),
    revoke: vi.fn(async (id: string) => {
      const row = apiKeys.get(id);
      if (row) row.isRevoked = true;
      return row ?? null;
    }),
    rotateWithKey: vi.fn(
      async (
        keyId: string,
        dto: {
          organizationId: string;
          rateLimit?: number;
          scopes: string[];
          userId: string;
        },
      ) => {
        const replacement = seedApiKey({
          organizationId: dto.organizationId,
          rateLimit: dto.rateLimit ?? null,
          scopes: dto.scopes,
          userId: dto.userId,
        });
        const previous = apiKeys.get(keyId);
        if (previous) previous.isRevoked = true;
        return {
          apiKey: replacement,
          plainKey: `gf_test_${replacement.id}`,
        };
      },
    ),
  } as unknown as ApiKeysService;

  const client: OAuthClientRecord = {
    clientId,
    clientName: 'Claude',
    createdAt: new Date(),
    grantTypes: ['authorization_code', 'refresh_token'],
    redirectUris: ['https://claude.ai/oauth/callback'],
    responseTypes: ['code'],
    tokenEndpointAuthMethod: 'none',
  };
  const clientService = {
    requireClient: vi.fn().mockResolvedValue(client),
  } as unknown as OAuthClientService;
  const logger = { warn: vi.fn() } as unknown as LoggerService;

  const prisma = {
    mcpOAuthRefreshToken: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        refreshSequence += 1;
        const row = {
          consumedAt: null,
          replacedById: null,
          revokedAt: null,
          ...data,
          id: `refresh-${refreshSequence}`,
        } as RefreshTokenRow;
        refreshTokens.set(row.tokenHash, row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          Array.from(refreshTokens.values()).find((row) =>
            matches(row, where),
          ) ?? null,
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { tokenHash: string } }) =>
          refreshTokens.get(where.tokenHash) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => {
          const rows = Array.from(refreshTokens.values()).filter((row) =>
            matches(row, where),
          );
          for (const row of rows) Object.assign(row, data);
          return { count: rows.length };
        },
      ),
    },
  } as unknown as PrismaService;

  return {
    apiKeys,
    apiKeysService,
    clientService,
    logger,
    prisma,
    refreshTokens,
    seedApiKey,
    seedRefreshToken,
    service: new OAuthRefreshTokenService(
      apiKeysService,
      clientService,
      logger,
      prisma,
    ),
  };
}

function refreshGrant(
  refreshToken: string,
  overrides: Partial<Pick<OAuthRefreshTokenGrant, 'resource' | 'scope'>> = {},
): OAuthRefreshTokenGrant {
  return {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    ...overrides,
  };
}

const invalidGrant = {
  response: expect.objectContaining({ error: 'invalid_grant' }),
};

describe('OAuthRefreshTokenService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a refresh token bound to the access key, tenant, resource and scopes', async () => {
    const { refreshTokens, service } = buildHarness();

    const issued = await service.issue({
      apiKeyId: 'key-1',
      clientId,
      organizationId: 'org-1',
      resource,
      scopes: grantedScopes,
      userId: 'user-1',
    });

    expect(issued.refreshToken.length).toBeGreaterThanOrEqual(32);
    const stored = refreshTokens.get(hashToken(issued.refreshToken));
    expect(stored).toMatchObject({
      apiKeyId: 'key-1',
      clientId,
      id: issued.id,
      organizationId: 'org-1',
      resource,
      scopes: grantedScopes,
      userId: 'user-1',
    });
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 89 * 24 * 60 * 60 * 1000,
    );
    expect(stored?.tokenHash).not.toBe(issued.refreshToken);
  });

  it('rotates the access key and refresh token without a consent interaction', async () => {
    const { apiKeys, apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    const original = seedApiKey();
    const row = seedRefreshToken('refresh-plain-token-original', {
      apiKeyId: original.id,
    });

    const token = await service.refresh(
      refreshGrant('refresh-plain-token-original'),
    );

    expect(token).toMatchObject({
      access_token: 'gf_test_key-2',
      scope: grantedScopes.join(' '),
      token_type: 'Bearer',
    });
    expect(token.expires_in).toBeGreaterThan(0);
    expect(token.refresh_token).not.toBe('refresh-plain-token-original');
    expect(apiKeysService.rotateWithKey).toHaveBeenCalledWith(
      original.id,
      expect.objectContaining({
        metadata: { kind: 'mcp-oauth-session', resource },
        organizationId: 'org-1',
        scopes: grantedScopes,
        userId: 'user-1',
      }),
      'mcp',
    );
    expect(apiKeys.get(original.id)?.isRevoked).toBe(true);
    expect(row.consumedAt).toBeInstanceOf(Date);
    expect(row.replacedById).toBe('refresh-2');

    const renewed = await service.refresh(refreshGrant(token.refresh_token));
    expect(renewed.access_token).toBe('gf_test_key-3');
    expect(apiKeys.get('key-2')?.isRevoked).toBe(true);
  });

  it('rejects an expired refresh token without issuing a token', async () => {
    const { apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    seedApiKey();
    seedRefreshToken('refresh-plain-token-expired', {
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.refresh(refreshGrant('refresh-plain-token-expired')),
    ).rejects.toMatchObject(invalidGrant);
    expect(apiKeysService.rotateWithKey).not.toHaveBeenCalled();
  });

  it('rejects a revoked refresh token', async () => {
    const { apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    seedApiKey();
    seedRefreshToken('refresh-plain-token-revoked', {
      revokedAt: new Date(),
    });

    await expect(
      service.refresh(refreshGrant('refresh-plain-token-revoked')),
    ).rejects.toMatchObject(invalidGrant);
    expect(apiKeysService.rotateWithKey).not.toHaveBeenCalled();
  });

  it('rejects a replayed refresh token and revokes the replacement chain', async () => {
    const {
      apiKeys,
      apiKeysService,
      logger,
      seedApiKey,
      seedRefreshToken,
      service,
    } = buildHarness();
    const original = seedApiKey();
    seedRefreshToken('refresh-plain-token-first', { apiKeyId: original.id });

    const rotated = await service.refresh(
      refreshGrant('refresh-plain-token-first'),
    );
    const replacementKeyId = 'key-2';
    expect(apiKeys.get(replacementKeyId)?.isRevoked).toBe(false);

    await expect(
      service.refresh(refreshGrant('refresh-plain-token-first')),
    ).rejects.toMatchObject(invalidGrant);
    expect(apiKeys.get(replacementKeyId)?.isRevoked).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'MCP OAuth refresh token reuse detected',
      expect.not.objectContaining({ tokenHash: expect.anything() }),
    );

    await expect(
      service.refresh(refreshGrant(rotated.refresh_token)),
    ).rejects.toMatchObject(invalidGrant);
    expect(apiKeysService.rotateWithKey).toHaveBeenCalledTimes(1);
  });

  it('rejects a refresh token presented by a different client', async () => {
    const { apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    seedApiKey();
    seedRefreshToken('refresh-plain-token-client', { clientId: otherClientId });

    await expect(
      service.refresh(refreshGrant('refresh-plain-token-client')),
    ).rejects.toMatchObject(invalidGrant);
    expect(apiKeysService.rotateWithKey).not.toHaveBeenCalled();
  });

  it('rejects a refresh token whose access key was revoked from settings', async () => {
    const { apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    const key = seedApiKey({ isRevoked: true });
    seedRefreshToken('refresh-plain-token-settings', { apiKeyId: key.id });

    await expect(
      service.refresh(refreshGrant('refresh-plain-token-settings')),
    ).rejects.toMatchObject(invalidGrant);
    expect(apiKeysService.rotateWithKey).not.toHaveBeenCalled();
  });

  it('denies a refresh token whose access key belongs to another tenant', async () => {
    const { apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    const foreignKey = seedApiKey({ organizationId: 'org-2' });
    seedRefreshToken('refresh-plain-token-tenant', {
      apiKeyId: foreignKey.id,
      organizationId: 'org-1',
    });
    const otherUserKey = seedApiKey({ userId: 'user-2' });
    seedRefreshToken('refresh-plain-token-user', {
      apiKeyId: otherUserKey.id,
    });

    await expect(
      service.refresh(refreshGrant('refresh-plain-token-tenant')),
    ).rejects.toMatchObject(invalidGrant);
    await expect(
      service.refresh(refreshGrant('refresh-plain-token-user')),
    ).rejects.toMatchObject(invalidGrant);
    expect(apiKeysService.rotateWithKey).not.toHaveBeenCalled();
  });

  it('narrows scopes on request and rejects widening', async () => {
    const { apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    seedApiKey();
    seedRefreshToken('refresh-plain-token-widen');
    seedRefreshToken('refresh-plain-token-narrow');

    await expect(
      service.refresh(
        refreshGrant('refresh-plain-token-widen', {
          scope: 'videos:read admin',
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_scope' }),
    });
    expect(apiKeysService.rotateWithKey).not.toHaveBeenCalled();

    const token = await service.refresh(
      refreshGrant('refresh-plain-token-narrow', { scope: 'videos:read' }),
    );
    expect(token.scope).toBe('videos:read');
    expect(apiKeysService.rotateWithKey).toHaveBeenCalledWith(
      'key-1',
      expect.objectContaining({ scopes: ['videos:read'] }),
      'mcp',
    );
  });

  it('rejects a resource that differs from the bound resource', async () => {
    const { seedApiKey, seedRefreshToken, service } = buildHarness();
    seedApiKey();
    seedRefreshToken('refresh-plain-token-resource');

    await expect(
      service.refresh(
        refreshGrant('refresh-plain-token-resource', {
          resource: 'https://attacker.example/mcp',
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_target' }),
    });
  });

  it('revokes a refresh token and its access key, and is idempotent for unknown tokens', async () => {
    const { apiKeys, apiKeysService, seedApiKey, seedRefreshToken, service } =
      buildHarness();
    const key = seedApiKey();
    const row = seedRefreshToken('refresh-plain-token-revoke', {
      apiKeyId: key.id,
    });

    await expect(
      service.revoke({ client_id: clientId, token: 'unknown-token-value-xyz' }),
    ).resolves.toBeUndefined();

    await service.revoke({
      client_id: clientId,
      token: 'refresh-plain-token-revoke',
    });
    expect(row.revokedAt).toBeInstanceOf(Date);
    expect(apiKeys.get(key.id)?.isRevoked).toBe(true);

    await expect(
      service.revoke({
        client_id: clientId,
        token: 'refresh-plain-token-revoke',
      }),
    ).resolves.toBeUndefined();
    expect(apiKeysService.revoke).toHaveBeenCalledTimes(1);

    await expect(
      service.refresh(refreshGrant('refresh-plain-token-revoke')),
    ).rejects.toMatchObject(invalidGrant);
  });

  it('ignores a revocation from a client that does not own the token', async () => {
    const { apiKeys, seedApiKey, seedRefreshToken, service } = buildHarness();
    const key = seedApiKey();
    const row = seedRefreshToken('refresh-plain-token-foreign', {
      apiKeyId: key.id,
    });

    await service.revoke({
      client_id: otherClientId,
      token: 'refresh-plain-token-foreign',
    });

    expect(row.revokedAt).toBeNull();
    expect(apiKeys.get(key.id)?.isRevoked).toBe(false);
  });

  it('revokes by access token when the hint names one', async () => {
    const { apiKeys, seedApiKey, seedRefreshToken, service } = buildHarness();
    const key = seedApiKey();
    const row = seedRefreshToken('refresh-plain-token-access', {
      apiKeyId: key.id,
    });

    await service.revoke({
      client_id: clientId,
      token: `gf_test_${key.id}`,
      token_type_hint: 'access_token',
    });

    expect(apiKeys.get(key.id)?.isRevoked).toBe(true);
    expect(row.revokedAt).toBeInstanceOf(Date);
  });
});

describe('OAuthTokenExchangeDto', () => {
  it('requires only the refresh token for a refresh_token grant', async () => {
    const errors = await validate(
      plainToInstance(OAuthTokenExchangeDto, {
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: 'refresh-plain-token-valid',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects a refresh_token grant without a refresh token', async () => {
    const errors = await validate(
      plainToInstance(OAuthTokenExchangeDto, {
        client_id: clientId,
        grant_type: 'refresh_token',
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(['refresh_token']);
  });

  it('still requires the PKCE fields for an authorization_code grant', async () => {
    const errors = await validate(
      plainToInstance(OAuthTokenExchangeDto, {
        client_id: clientId,
        grant_type: 'authorization_code',
      }),
    );

    expect(errors.map((error) => error.property).sort()).toEqual([
      'code',
      'code_verifier',
      'redirect_uri',
      'resource',
    ]);
  });

  it('rejects unknown grant types', async () => {
    const errors = await validate(
      plainToInstance(OAuthTokenExchangeDto, {
        client_id: clientId,
        grant_type: 'client_credentials',
      }),
    );

    expect(errors.map((error) => error.property)).toContain('grant_type');
  });
});

describe('OAuthRevokeTokenDto', () => {
  it('accepts a token with an optional hint', async () => {
    expect(
      await validate(
        plainToInstance(OAuthRevokeTokenDto, {
          client_id: clientId,
          token: 'refresh-plain-token-valid',
          token_type_hint: 'refresh_token',
        }),
      ),
    ).toHaveLength(0);
  });

  it('rejects an unknown hint and a missing client', async () => {
    const errors = await validate(
      plainToInstance(OAuthRevokeTokenDto, {
        token: 'refresh-plain-token-valid',
        token_type_hint: 'id_token',
      }),
    );

    expect(errors.map((error) => error.property).sort()).toEqual([
      'client_id',
      'token_type_hint',
    ]);
  });
});
