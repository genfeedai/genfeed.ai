import 'reflect-metadata';

import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthJwtBearerGrant } from '../dto/token-exchange.dto';
import {
  buildIssuerFixture,
  FIXTURE_CLIENT_ID,
  FIXTURE_ISSUER,
} from './enterprise-assertion.fixture';
import { EnterpriseAssertionVerifier } from './enterprise-assertion.verifier';
import type { OAuthClientService } from './oauth-client.service';
import { OAuthEnterpriseAuthService } from './oauth-enterprise-auth.service';

const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const MCP_RESOURCE = 'https://mcp.genfeed.ai/mcp';

type Config = {
  isEnabled: boolean;
  organizationId: string;
  trustedIssuer: string;
};
type MemberRow = {
  banned: boolean;
  currentBrandId: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  organizationId: string;
  userId: string;
};

async function buildHarness({
  clientGrantTypes = ['authorization_code', 'refresh_token', JWT_BEARER],
  configs = [
    { isEnabled: true, organizationId: 'org-1', trustedIssuer: FIXTURE_ISSUER },
  ] as Config[],
  members = [
    {
      banned: false,
      currentBrandId: 'brand-1',
      email: 'alex@acme.example',
      emailVerified: true,
      isActive: true,
      organizationId: 'org-1',
      userId: 'user-1',
    },
  ] as MemberRow[],
  organizations = ['org-1'],
} = {}) {
  const fixture = await buildIssuerFixture();
  const claimed = new Set<string>();
  const createdKeys: Array<Record<string, unknown>> = [];

  const prisma = {
    brand: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) =>
        where.id === 'brand-1' && where.organizationId === 'org-1'
          ? { id: 'brand-1' }
          : null,
    },
    mcpEnterpriseAuthAssertion: {
      create: async ({
        data,
      }: {
        data: { issuer: string; jtiHash: string };
      }) => {
        const key = `${data.issuer}|${data.jtiHash}`;
        if (claimed.has(key)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        claimed.add(key);
        return data;
      },
      deleteMany: async () => ({ count: 0 }),
    },
    mcpEnterpriseAuthConfig: {
      findMany: async ({
        where,
      }: {
        where: {
          isEnabled: boolean;
          organizationId?: string;
          trustedIssuer: string;
        };
      }) =>
        configs
          .filter(
            (config) =>
              config.isEnabled === where.isEnabled &&
              config.trustedIssuer === where.trustedIssuer &&
              (where.organizationId === undefined ||
                config.organizationId === where.organizationId),
          )
          .map(({ organizationId }) => ({ organizationId })),
    },
    member: {
      findMany: async ({
        where,
      }: {
        where: {
          isActive: boolean;
          organizationId: string;
          user: {
            banned: boolean;
            email: { equals: string };
            emailVerified: boolean;
          };
        };
      }) =>
        members
          .filter(
            (member) =>
              member.isActive === where.isActive &&
              member.organizationId === where.organizationId &&
              member.banned === where.user.banned &&
              member.emailVerified === where.user.emailVerified &&
              member.email.toLowerCase() ===
                where.user.email.equals.toLowerCase(),
          )
          .map(({ currentBrandId, userId }) => ({ currentBrandId, userId })),
    },
    organization: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        organizations.includes(where.id) ? { id: where.id } : null,
    },
  } as unknown as PrismaService;

  const apiKeysService = {
    createWithKey: async (input: Record<string, unknown>) => {
      createdKeys.push(input);
      return {
        apiKey: { expiresAt: new Date(input.expiresAt as string) },
        plainKey: 'gf_live_enterprise',
      };
    },
  } as unknown as ApiKeysService;

  const clientService = {
    requireClient: async () => ({
      clientId: FIXTURE_CLIENT_ID,
      clientName: 'Claude',
      createdAt: new Date(),
      grantTypes: clientGrantTypes,
      redirectUris: [],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'none',
    }),
  } as unknown as OAuthClientService;

  const configService = {
    get: (key: string) => {
      if (key === 'GENFEEDAI_API_PUBLIC_URL') return 'https://api.genfeed.ai';
      if (key === 'GENFEEDAI_MCP_PUBLIC_URL') return MCP_RESOURCE;
      return undefined;
    },
  } as unknown as ConfigService;

  const service = new OAuthEnterpriseAuthService(
    apiKeysService,
    clientService,
    configService,
    { warn: vi.fn() } as unknown as LoggerService,
    prisma,
    new EnterpriseAssertionVerifier(fixture.issuerKeys),
  );

  async function grant(
    options: Parameters<typeof fixture.sign>[0] = {},
    extra: Partial<OAuthJwtBearerGrant> = {},
  ): Promise<OAuthJwtBearerGrant> {
    return {
      assertion: await fixture.sign({
        ...options,
        claims: { aud: ['https://api.genfeed.ai'], ...options.claims },
      }),
      client_id: FIXTURE_CLIENT_ID,
      grant_type: JWT_BEARER,
      resource: MCP_RESOURCE,
      ...extra,
    } as OAuthJwtBearerGrant;
  }

  return { createdKeys, grant, service };
}

describe('OAuthEnterpriseAuthService', () => {
  let harness: Awaited<ReturnType<typeof buildHarness>>;

  beforeEach(async () => {
    harness = await buildHarness();
  });

  it('signs a member in and returns a bearer token with no refresh token', async () => {
    const response = await harness.service.exchange(await harness.grant());

    expect(response).toEqual({
      access_token: 'gf_live_enterprise',
      expires_in: expect.any(Number),
      scope: 'brands:read posts:draft',
      token_type: 'Bearer',
    });
    expect(response).not.toHaveProperty('refresh_token');
    expect(response.expires_in).toBeGreaterThan(3500);
    expect(response.expires_in).toBeLessThanOrEqual(3600);
  });

  it('issues the key to the matched member, in the trusting organization, on its current brand', async () => {
    await harness.service.exchange(
      await harness.grant({ claims: { email: 'ALEX@ACME.EXAMPLE' } }),
    );

    expect(harness.createdKeys[0]).toMatchObject({
      defaultBrandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(harness.createdKeys[0]?.metadata).toMatchObject({
      authMethod: 'enterprise-managed',
      resource: MCP_RESOURCE,
    });
  });

  it('keeps the grant id stable across renewals', async () => {
    await harness.service.exchange(await harness.grant());
    await harness.service.exchange(await harness.grant());

    const [first, second] = harness.createdKeys.map(
      (key) => (key.metadata as { grantId: string }).grantId,
    );
    expect(first).toMatch(/^ema_[0-9a-f]{24}$/);
    expect(second).toBe(first);
  });

  it('only grants scopes under the resource ceiling', async () => {
    const response = await harness.service
      .exchange(await harness.grant({}, { scope: 'definitely-not-a-scope' }))
      .catch((error: { response: unknown }) => error.response);

    expect(response).toEqual({
      error: 'invalid_scope',
      error_description: 'No supported scopes were requested',
    });
  });

  it('refuses the same assertion twice', async () => {
    const request = await harness.grant({ claims: { jti: 'once-only' } });

    await expect(harness.service.exchange(request)).resolves.toMatchObject({
      token_type: 'Bearer',
    });
    await expect(harness.service.exchange(request)).rejects.toMatchObject({
      response: { error: 'invalid_grant' },
    });
  });

  it('refuses a client that did not declare the jwt-bearer grant', async () => {
    const restricted = await buildHarness({
      clientGrantTypes: ['authorization_code', 'refresh_token'],
    });

    await expect(
      restricted.service.exchange(await restricted.grant()),
    ).rejects.toMatchObject({ response: { error: 'unauthorized_client' } });
  });

  it('refuses a resource this server does not protect', async () => {
    await expect(
      harness.service.exchange(
        await harness.grant({}, { resource: 'https://elsewhere.example/mcp' }),
      ),
    ).rejects.toMatchObject({ response: { error: 'invalid_target' } });
  });

  it('refuses an assertion whose resource claim names something else', async () => {
    await expect(
      harness.service.exchange(
        await harness.grant({
          claims: { resource: 'https://elsewhere.example/mcp' },
        }),
      ),
    ).rejects.toMatchObject({ response: { error: 'invalid_grant' } });
  });

  it.each([
    [
      'an issuer no workspace trusts',
      { claims: { iss: 'https://unknown.example' } },
    ],
    ['a wrong tenant id', { claims: { aud_tenant: 'org-2' } }],
    [
      'a bad signature audience',
      { claims: { aud: ['https://other.example'] } },
    ],
    [
      'a person who is not a member',
      { claims: { email: 'stranger@acme.example' } },
    ],
  ])('rejects %s with invalid_grant', async (_label, options) => {
    await expect(
      harness.service.exchange(await harness.grant(options)),
    ).rejects.toMatchObject({ response: { error: 'invalid_grant' } });
  });

  it.each([
    ['an inactive member', { isActive: false }],
    ['an unverified email', { emailVerified: false }],
    ['a banned user', { banned: true }],
    ['a member of another workspace', { organizationId: 'org-2' }],
  ])('rejects %s', async (_label, override) => {
    const base = {
      banned: false,
      currentBrandId: 'brand-1',
      email: 'alex@acme.example',
      emailVerified: true,
      isActive: true,
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const scoped = await buildHarness({ members: [{ ...base, ...override }] });

    await expect(
      scoped.service.exchange(await scoped.grant()),
    ).rejects.toMatchObject({ response: { error: 'invalid_grant' } });
  });

  it('refuses an issuer that two workspaces trust unless a tenant id picks one', async () => {
    const shared = await buildHarness({
      configs: [
        {
          isEnabled: true,
          organizationId: 'org-1',
          trustedIssuer: FIXTURE_ISSUER,
        },
        {
          isEnabled: true,
          organizationId: 'org-2',
          trustedIssuer: FIXTURE_ISSUER,
        },
      ],
      organizations: ['org-1', 'org-2'],
    });

    await expect(
      shared.service.exchange(await shared.grant()),
    ).rejects.toMatchObject({ response: { error: 'invalid_grant' } });
    await expect(
      shared.service.exchange(
        await shared.grant({ claims: { aud_tenant: 'org-1' } }),
      ),
    ).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('ignores a workspace that turned enterprise auth off', async () => {
    const off = await buildHarness({
      configs: [
        {
          isEnabled: false,
          organizationId: 'org-1',
          trustedIssuer: FIXTURE_ISSUER,
        },
      ],
    });

    await expect(off.service.exchange(await off.grant())).rejects.toMatchObject(
      {
        response: { error: 'invalid_grant' },
      },
    );
  });

  it('ignores a deleted workspace', async () => {
    const gone = await buildHarness({ organizations: [] });

    await expect(
      gone.service.exchange(await gone.grant()),
    ).rejects.toMatchObject({
      response: { error: 'invalid_grant' },
    });
  });
});
