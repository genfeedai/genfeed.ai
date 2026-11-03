import 'reflect-metadata';

import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';
import {
  McpEnterpriseAuthConfigService,
  parseTrustedIssuer,
} from './mcp-enterprise-auth-config.service';

type Row = {
  isEnabled: boolean;
  organizationId: string;
  trustedIssuer: string;
};

function buildService() {
  const rows = new Map<string, Row>();
  const prisma = {
    mcpEnterpriseAuthConfig: {
      deleteMany: async ({ where }: { where: { organizationId: string } }) => {
        rows.delete(where.organizationId);
      },
      findUnique: async ({ where }: { where: { organizationId: string } }) =>
        rows.get(where.organizationId) ?? null,
      upsert: async ({ create }: { create: Row }) => {
        rows.set(create.organizationId, create);
        return create;
      },
    },
  } as unknown as PrismaService;
  const configService = {
    get: (key: string) => {
      if (key === 'GENFEEDAI_API_PUBLIC_URL') return 'https://api.genfeed.ai';
      if (key === 'GENFEEDAI_MCP_PUBLIC_URL')
        return 'https://mcp.genfeed.ai/mcp';
      return undefined;
    },
  } as unknown as ConfigService;
  return new McpEnterpriseAuthConfigService(configService, prisma);
}

describe('parseTrustedIssuer', () => {
  it.each([
    'https://acme.okta.com',
    'https://acme.okta.com/',
    'https://login.example.com/oauth2/default',
    'https://identity.anthropic.com/issuers/abc123',
  ])('keeps %s exactly as written', (issuer) => {
    expect(parseTrustedIssuer(`  ${issuer}  `)).toBe(issuer);
  });

  it.each([
    'http://acme.okta.com',
    'acme.okta.com',
    'https://user:secret@acme.okta.com',
    'https://acme.okta.com?tenant=1',
    'https://acme.okta.com#frag',
    'https://acme.okta.com/#',
    'javascript:alert(1)',
  ])('rejects %s', (issuer) => {
    expect(() => parseTrustedIssuer(issuer)).toThrow();
  });
});

describe('McpEnterpriseAuthConfigService', () => {
  it('reports a disabled setup with the values to enter in the connector', async () => {
    await expect(buildService().get('org-1')).resolves.toEqual({
      audience: 'https://api.genfeed.ai',
      isEnabled: false,
      resource: 'https://mcp.genfeed.ai/mcp',
      tenantId: 'org-1',
      tokenEndpoint: 'https://api.genfeed.ai/v1/oauth/token',
      trustedIssuer: null,
    });
  });

  it('saves, reads back and removes the trusted issuer', async () => {
    const service = buildService();

    await expect(
      service.save(
        'org-1',
        { isEnabled: true, trustedIssuer: 'https://acme.okta.com' },
        'user-1',
      ),
    ).resolves.toMatchObject({
      isEnabled: true,
      tenantId: 'org-1',
      trustedIssuer: 'https://acme.okta.com',
    });
    await expect(service.get('org-1')).resolves.toMatchObject({
      isEnabled: true,
      trustedIssuer: 'https://acme.okta.com',
    });

    await service.remove('org-1');
    await expect(service.get('org-1')).resolves.toMatchObject({
      isEnabled: false,
      trustedIssuer: null,
    });
  });

  it('refuses to trust Genfeed as its own assertion issuer', async () => {
    await expect(
      buildService().save(
        'org-1',
        { isEnabled: true, trustedIssuer: 'https://api.genfeed.ai' },
        'user-1',
      ),
    ).rejects.toThrow('not Genfeed');
  });
});
