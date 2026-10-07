import 'reflect-metadata';

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { buildCodeChallenge } from '@api/auth/shared/pkce.util';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { OAuthAuthorizeController } from '@api/oauth/controllers/oauth-authorize.controller';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PRISMA_MODEL_METADATA } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { tenantModelsFromMetadata } from '@libs/prisma/discover-tenant-models';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import request from 'supertest';
import { OAuthAuthorizeDecisionDto } from '../dto/authorize-decision.dto';
import { OAuthAuthorizeRequestDto } from '../dto/authorize-request.dto';
import { OAuthAuthorizeService } from './oauth-authorize.service';
import type {
  OAuthClientRecord,
  OAuthClientService,
} from './oauth-client.service';
import type { OAuthRefreshTokenService } from './oauth-refresh-token.service';

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
    organizationId: 'org-1',
    userId: 'user-1',
  };
}

function makeOrganization(
  id: string,
  isDeleted = false,
  isActive = true,
  isMemberDeleted = false,
  userId = 'user-1',
) {
  return {
    id,
    isDeleted,
    members: [{ isActive, isDeleted: isMemberDeleted, userId }],
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
  const organizations = [makeOrganization('org-1')];
  const prisma = {
    organization: {
      findMany: vi.fn().mockImplementation(async (args: unknown) => {
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'Organization',
          operation: 'findMany',
          tenantModelNames: new Set(
            tenantModelsFromMetadata(PRISMA_MODEL_METADATA).map(
              ({ model }) => model,
            ),
          ),
        });
        expect(args).toEqual({
          select: { id: true },
          where: {
            isDeleted: false,
            members: {
              some: { userId: 'user-1', isActive: true, isDeleted: false },
            },
          },
        });
        return organizations.filter(
          (organization) =>
            !organization.isDeleted &&
            organization.members.some(
              (member) =>
                member.userId === 'user-1' &&
                member.isActive &&
                !member.isDeleted,
            ),
        );
      }),
    },
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
          where: {
            clientId: string;
            id: string;
            organizationId: string;
            usedAt: null;
            userId: string;
          };
        }) => {
          const record = Array.from(records.values()).find(
            (candidate) =>
              candidate.clientId === where.clientId &&
              candidate.id === where.id &&
              candidate.organizationId === where.organizationId &&
              candidate.userId === where.userId &&
              candidate.usedAt === where.usedAt,
          );
          if (!record) return { count: 0 };
          Object.assign(record, data);
          return { count: 1 };
        },
      ),
    },
  } as unknown as PrismaService;

  const refreshTokenService = {
    issue: vi
      .fn()
      .mockResolvedValue({ id: 'refresh-1', refreshToken: 'refresh-plain' }),
  } as unknown as OAuthRefreshTokenService;

  return {
    apiKeysService,
    organizations,
    prisma,
    refreshTokenService,
    service: new OAuthAuthorizeService(
      apiKeysService,
      clientService,
      configService,
      prisma,
      refreshTokenService,
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

  it('requires an explicit choice for multiple live memberships before creating a grant', async () => {
    const { organizations, prisma, service } = buildHarness();
    organizations.push(makeOrganization('org-2'));
    await expect(
      service.decideAuthorization(makeUser(), decision()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_request' }),
    });
    expect(prisma.mcpOAuthAuthCode.create).not.toHaveBeenCalled();
  });

  it('binds the code, access key and refresh session only to the chosen organization', async () => {
    const {
      apiKeysService,
      organizations,
      prisma,
      refreshTokenService,
      service,
    } = buildHarness();
    organizations.push(makeOrganization('org-2'));
    const authorization = await service.decideAuthorization(
      makeUser(),
      decision({ organizationId: 'org-2' }),
    );
    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        isDeleted: false,
        members: {
          some: { userId: 'user-1', isActive: true, isDeleted: false },
        },
      },
    });
    expect(prisma.mcpOAuthAuthCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-2',
        userId: 'user-1',
      }),
    });
    await service.exchangeToken({
      client_id: clientId,
      code: new URL(authorization.redirectUrl).searchParams.get(
        'code',
      ) as string,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      resource,
    });
    expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-2', userId: 'user-1' }),
      'mcp',
    );
    expect(refreshTokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-2', userId: 'user-1' }),
    );
  });

  it.each([
    'foreign-org',
    'deleted-membership',
    'inactive-membership',
    'deleted-org',
  ])(
    'rejects %s rather than falling back to the active organization',
    async (organizationId) => {
      const { organizations, prisma, service } = buildHarness();
      organizations.push(
        makeOrganization(
          organizationId,
          organizationId === 'deleted-org',
          organizationId !== 'inactive-membership',
          organizationId === 'deleted-membership',
          organizationId === 'foreign-org' ? 'another-user' : 'user-1',
        ),
      );
      await expect(
        service.decideAuthorization(makeUser(), decision({ organizationId })),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'invalid_request' }),
      });
      expect(prisma.mcpOAuthAuthCode.create).not.toHaveBeenCalled();
    },
  );

  it('approves the sole live organization even when the default identity is stale', async () => {
    const { organizations, prisma, service } = buildHarness();
    organizations.splice(0, organizations.length, makeOrganization('org-2'));
    await service.decideAuthorization(makeUser(), decision());
    expect(prisma.mcpOAuthAuthCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org-2' }),
    });
  });

  it('rejects approval when no live memberships remain', async () => {
    const { organizations, prisma, service } = buildHarness();
    organizations.splice(0);
    await expect(
      service.decideAuthorization(makeUser(), decision()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_request' }),
    });
    expect(prisma.mcpOAuthAuthCode.create).not.toHaveBeenCalled();
  });

  it('can deny access without selecting or discovering an organization', async () => {
    const { organizations, prisma, service } = buildHarness();
    organizations.push(makeOrganization('org-2'));
    await expect(
      service.decideAuthorization(makeUser(), decision({ approved: false })),
    ).resolves.toMatchObject({
      redirectUrl: expect.stringContaining('access_denied'),
    });
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
    expect(prisma.mcpOAuthAuthCode.create).not.toHaveBeenCalled();
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
          clientName: 'Claude',
          grantId: 'code-1',
          kind: 'mcp-oauth-session',
          mcpAccessMode: 'standard',
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

  it('binds a ?profile= endpoint URL sent as resource to the canonical MCP resource', async () => {
    const { apiKeysService, prisma, service } = buildHarness();
    const profiled = `${resource}?profile=full`;
    const authorization = await service.decideAuthorization(
      makeUser(),
      decision({ resource: profiled }),
    );
    const code = new URL(authorization.redirectUrl).searchParams.get('code');

    expect(prisma.mcpOAuthAuthCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resource }),
    });
    await expect(
      service.exchangeToken({
        client_id: clientId,
        code: code as string,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        resource: profiled,
      }),
    ).resolves.toMatchObject({ token_type: 'Bearer' });
    expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ resource }),
      }),
      'mcp',
    );
  });

  it('still rejects a resource with any other query', async () => {
    const { service } = buildHarness();

    await expect(
      service.decideAuthorization(
        makeUser(),
        decision({ resource: `${resource}?profile=full&tenant=other` }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_target' }),
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

  describe('optional state (#4553)', () => {
    it('completes consent without state and redirects with no state param', async () => {
      const { prisma, service } = buildHarness();

      const consentTarget = await service.buildAuthorizeRedirect({
        client_id: clientId,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        resource,
        response_type: 'code',
      });
      expect(new URL(consentTarget).searchParams.has('state')).toBe(false);

      const authorization = await service.decideAuthorization(
        makeUser(),
        decision({ state: undefined }),
      );
      const redirect = new URL(authorization.redirectUrl);
      expect(redirect.searchParams.get('code')).toBeTruthy();
      expect(redirect.searchParams.has('state')).toBe(false);
      expect(authorization.redirectUrl).not.toContain('undefined');
      expect(prisma.mcpOAuthAuthCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stateHash: null }),
      });

      const token = await service.exchangeToken({
        client_id: clientId,
        code: redirect.searchParams.get('code') as string,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        resource,
      });
      expect(token.access_token).toBe('gf_live_oauth');
    });

    it('treats an empty state as absent', async () => {
      const { service } = buildHarness();
      const authorization = await service.decideAuthorization(
        makeUser(),
        decision({ state: '' }),
      );

      expect(new URL(authorization.redirectUrl).searchParams.has('state')).toBe(
        false,
      );
    });

    it('echoes a supplied state unchanged on both the code and the denial redirect', async () => {
      const { prisma, service } = buildHarness();
      const state = 'short:state/with?reserved=chars&and spaces';

      const approved = await service.decideAuthorization(
        makeUser(),
        decision({ state }),
      );
      const approvedRedirect = new URL(approved.redirectUrl);
      expect(approvedRedirect.searchParams.get('state')).toBe(state);
      expect(approvedRedirect.searchParams.get('code')).toBeTruthy();
      expect(prisma.mcpOAuthAuthCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stateHash: expect.any(String) }),
      });

      const denied = await service.decideAuthorization(
        makeUser(),
        decision({ approved: false, state }),
      );
      const deniedRedirect = new URL(denied.redirectUrl);
      expect(deniedRedirect.searchParams.get('error')).toBe('access_denied');
      expect(deniedRedirect.searchParams.get('state')).toBe(state);
    });
  });

  describe('request validation (#4553)', () => {
    function authorizeQuery(overrides: Record<string, unknown> = {}) {
      return {
        client_id: clientId,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        resource,
        response_type: 'code',
        ...overrides,
      };
    }

    it('accepts an authorize request that omits state', async () => {
      const dto = plainToInstance(OAuthAuthorizeRequestDto, authorizeQuery());
      await expect(validate(dto)).resolves.toEqual([]);
    });

    it('accepts a short state (no RFC 6749 length floor)', async () => {
      const dto = plainToInstance(
        OAuthAuthorizeRequestDto,
        authorizeQuery({ state: 'xyz' }),
      );
      await expect(validate(dto)).resolves.toEqual([]);
    });

    it('caps state at 512 characters', async () => {
      const dto = plainToInstance(
        OAuthAuthorizeRequestDto,
        authorizeQuery({ state: 's'.repeat(513) }),
      );
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toEqual(['state']);
    });

    it.each(['plain', 'sha256', ''])(
      'still rejects code_challenge_method=%j',
      async (method) => {
        const dto = plainToInstance(
          OAuthAuthorizeRequestDto,
          authorizeQuery({ code_challenge_method: method }),
        );
        const errors = await validate(dto);
        expect(errors.map((error) => error.property)).toEqual([
          'code_challenge_method',
        ]);
      },
    );

    it('still requires a code_challenge alongside S256', async () => {
      const dto = plainToInstance(
        OAuthAuthorizeRequestDto,
        authorizeQuery({ code_challenge: undefined }),
      );
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toEqual(['code_challenge']);
    });

    it('accepts a decision that omits state and still requires S256', async () => {
      const withoutState = plainToInstance(OAuthAuthorizeDecisionDto, {
        ...authorizeQuery({ response_type: undefined }),
        approved: true,
      });
      await expect(validate(withoutState)).resolves.toEqual([]);

      const plainMethod = plainToInstance(OAuthAuthorizeDecisionDto, {
        ...authorizeQuery({
          code_challenge_method: 'plain',
          response_type: undefined,
        }),
        approved: true,
      });
      const errors = await validate(plainMethod);
      expect(errors.map((error) => error.property)).toEqual([
        'code_challenge_method',
      ]);
    });
  });
});

describe('Claude resource grant', () => {
  it('binds the restricted resource and removes generation scopes before minting a key', async () => {
    const { apiKeysService, service } = buildHarness();
    const claudeResource = `${resource}/claude`;
    const authorization = await service.decideAuthorization(
      makeUser(),
      decision({
        resource: `${claudeResource}?profile=full`,
        scope: 'images:create videos:create prompts:create posts:draft',
      }),
    );
    const code = new URL(authorization.redirectUrl).searchParams.get('code');
    const token = await service.exchangeToken({
      client_id: clientId,
      code: code as string,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      resource: claudeResource,
    });
    expect(token.scope).toBe('posts:draft');
    expect(apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          resource: claudeResource,
          mcpAccessMode: 'claude',
        }),
        scopes: ['posts:draft'],
      }),
      'mcp',
    );
  });
});

describe('OAuth consent HTTP tenant context', () => {
  let app: INestApplication;
  let harness: ReturnType<typeof buildHarness>;
  const contexts: Array<string | undefined> = [];

  beforeEach(async () => {
    harness = buildHarness();
    harness.organizations.push(makeOrganization('org-2'));
    contexts.length = 0;
    const findMany = vi
      .mocked(harness.prisma.organization.findMany)
      .getMockImplementation();
    vi.mocked(harness.prisma.organization.findMany).mockImplementation(
      async (...args) => {
        contexts.push(getTenantContext()?.organizationId);
        if (!findMany) {
          throw new Error('Missing membership discovery implementation');
        }
        return findMany(...args);
      },
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [OAuthAuthorizeController],
      providers: [
        { provide: OAuthAuthorizeService, useValue: harness.service },
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          // Model the real strategy: it restores the default identity, regardless
          // of the choice carried in the request body/header.
          context.switchToHttp().getRequest().user = makeUser();
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalInterceptors(new TenantContextInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps the approved workspace through real DTO validation and the default request tenant', async () => {
    const result = await request(app.getHttpServer())
      .post('/v1/oauth/authorize/decision')
      .send(decision({ organizationId: 'org-2' }))
      .expect(201);
    expect(contexts).toEqual(['org-1']);
    expect(harness.prisma.mcpOAuthAuthCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org-2' }),
    });
    await harness.service.exchangeToken({
      client_id: clientId,
      code: new URL(result.body.redirectUrl).searchParams.get('code') as string,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      resource,
    });
    expect(harness.apiKeysService.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-2' }),
      'mcp',
    );
  });

  it.each([undefined, 'foreign-org', ''])(
    'rejects an omitted, foreign or empty HTTP choice (%s)',
    async (organizationId) => {
      const result = await request(app.getHttpServer())
        .post('/v1/oauth/authorize/decision')
        .send(decision({ organizationId }))
        .expect(400);
      expect(result.body.error).toBe('invalid_request');
      expect(harness.prisma.mcpOAuthAuthCode.create).not.toHaveBeenCalled();
    },
  );
});
