import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { buildCodeChallenge } from '@api/auth/shared/pkce.util';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { OAuthAuthorizeDecisionDto } from '../dto/authorize-decision.dto';
import { OAuthAuthorizeService } from './oauth-authorize.service';
import type {
  OAuthClientRecord,
  OAuthClientService,
} from './oauth-client.service';

const clientId = 'oauth_client_123';
const redirectUri = 'https://claude.ai/oauth/callback';
const resource = 'https://mcp.genfeed.ai/mcp';
const verifier = 'mcp-oauth-verifier-mcp-oauth-verifier-mcp-oauth-verifier';
const challenge = buildCodeChallenge(verifier);

function makeUser(): User {
  return {
    emailAddresses: [{ emailAddress: 'founder@example.com' }],
    firstName: 'Genfeed',
    lastName: 'Founder',
    id: 'auth-user',
    publicMetadata: {
      organization: 'org-1',
      user: 'user-1',
    },
  };
}

function buildHarness() {
  const records = new Map<string, Record<string, unknown>>();
  const apiKeysService = {
    createWithKey: vi.fn().mockResolvedValue({
      apiKey: {
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      plainKey: 'gf_live_oauth',
    }),
  } as unknown as ApiKeysService;
  const client: OAuthClientRecord = {
    clientId,
    clientName: 'Claude',
    createdAt: new Date(),
    grantTypes: ['authorization_code'],
    redirectUris: [redirectUri],
    responseTypes: ['code'],
    tokenEndpointAuthMethod: 'none',
  };
  const clientService = {
    requireClient: vi.fn().mockResolvedValue(client),
  } as unknown as OAuthClientService;
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'GENFEEDAI_API_PUBLIC_URL') return 'https://api.genfeed.ai';
      if (key === 'GENFEEDAI_APP_URL') return 'https://app.genfeed.ai';
      if (key === 'GENFEEDAI_MCP_PUBLIC_URL') return resource;
      return undefined;
    }),
  } as unknown as ConfigService;
  const prisma = {
    mcpOAuthAuthCode: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = { ...data, id: 'code-1', usedAt: null };
        records.set(String(data.codeHash), record);
        return record;
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(
        async ({ where }: { where: { codeHash: string } }) =>
          records.get(where.codeHash) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { clientId: string; id: string; usedAt: null };
        }) => {
          const record = Array.from(records.values()).find(
            (candidate) =>
              candidate.clientId === where.clientId &&
              candidate.id === where.id &&
              candidate.usedAt === where.usedAt,
          );
          if (!record) return { count: 0 };
          Object.assign(record, data);
          return { count: 1 };
        },
      ),
    },
  } as unknown as PrismaService;

  return {
    apiKeysService,
    prisma,
    service: new OAuthAuthorizeService(
      apiKeysService,
      clientService,
      configService,
      prisma,
    ),
  };
}

function decision(
  overrides: Partial<OAuthAuthorizeDecisionDto> = {},
): OAuthAuthorizeDecisionDto {
  return {
    approved: true,
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: 'S256' as const,
    redirect_uri: redirectUri,
    resource,
    scope: 'videos:read admin',
    state: 'oauth-state-1234567890',
    ...overrides,
  };
}

describe('OAuthAuthorizeService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a consent redirect only after validating client and resource', async () => {
    const { service } = buildHarness();

    const target = await service.buildAuthorizeRedirect({
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      resource,
      response_type: 'code',
      state: 'oauth-state-1234567890',
    });

    expect(target).toContain('https://app.genfeed.ai/oauth/consent?');
    expect(target).toContain('client_name=Claude');
    expect(target).toContain(
      `resource=${encodeURIComponent('https://mcp.genfeed.ai/mcp')}`,
    );
  });

  it('clamps scopes, creates a single-use code, and mints a resource-bound key', async () => {
    const { apiKeysService, service } = buildHarness();
    const authorization = await service.decideAuthorization(
      makeUser(),
      decision(),
    );
    const code = new URL(authorization.redirectUrl).searchParams.get('code');
    expect(code).toBeTruthy();

    const token = await service.exchangeToken({
      client_id: clientId,
      code: code as string,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      resource,
    });

    expect(token).toMatchObject({
      access_token: 'gf_live_oauth',
      scope: 'videos:read',
      token_type: 'Bearer',
    });
    expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          kind: 'mcp-oauth-session',
          resource,
        },
        organizationId: 'org-1',
        scopes: ['videos:read'],
        userId: 'user-1',
      }),
      'mcp',
    );

    await expect(
      service.exchangeToken({
        client_id: clientId,
        code: code as string,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        resource,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_grant' }),
    });
  });

  it('rejects a PKCE or resource binding mismatch without minting a key', async () => {
    const { apiKeysService, service } = buildHarness();
    const authorization = await service.decideAuthorization(
      makeUser(),
      decision(),
    );
    const code = new URL(authorization.redirectUrl).searchParams.get('code');

    await expect(
      service.exchangeToken({
        client_id: clientId,
        code: code as string,
        code_verifier:
          'wrong-verifier-wrong-verifier-wrong-verifier-wrong-verifier',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        resource,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_grant' }),
    });
    expect(apiKeysService.createWithKey).not.toHaveBeenCalled();

    await expect(
      service.exchangeToken({
        client_id: clientId,
        code: code as string,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        resource: 'https://attacker.example/mcp',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_target' }),
    });
  });

  it('rejects expired codes and redirect binding mismatches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'));
    const { apiKeysService, service } = buildHarness();
    const authorization = await service.decideAuthorization(
      makeUser(),
      decision(),
    );
    const code = new URL(authorization.redirectUrl).searchParams.get('code');

    await expect(
      service.exchangeToken({
        client_id: clientId,
        code: code as string,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: 'https://claude.ai/oauth/other',
        resource,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_grant' }),
    });

    vi.setSystemTime(new Date('2026-07-23T12:01:01.000Z'));
    await expect(
      service.exchangeToken({
        client_id: clientId,
        code: code as string,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        resource,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_grant' }),
    });
    expect(apiKeysService.createWithKey).not.toHaveBeenCalled();
  });

  it('rejects a request containing no supported scopes', async () => {
    const { service } = buildHarness();

    await expect(
      service.decideAuthorization(
        makeUser(),
        decision({ scope: 'admin managed-inference:execute' }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_scope' }),
    });
  });

  it('returns access_denied without persisting a code', async () => {
    const { prisma, service } = buildHarness();
    const result = await service.decideAuthorization(
      makeUser(),
      decision({ approved: false }),
    );

    expect(result.redirectUrl).toContain('error=access_denied');
    expect(prisma.mcpOAuthAuthCode.create).not.toHaveBeenCalled();
  });
});
