import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { OAuthClientService } from './oauth-client.service';

function buildService() {
  const clients = new Map<string, Record<string, unknown>>();
  const prisma = {
    oAuthClient: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const client = {
          ...data,
          createdAt: new Date('2026-07-23T12:00:00.000Z'),
        };
        clients.set(String(data.clientId), client);
        return client;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { clientId: string } }) =>
          clients.get(where.clientId) ?? null,
      ),
    },
  } as unknown as PrismaService;
  return new OAuthClientService(prisma);
}

describe('OAuthClientService', () => {
  it('registers a public PKCE client without issuing a secret', async () => {
    const service = buildService();

    const result = await service.register({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/oauth/callback'],
    });

    expect(result.client_id).toMatch(/^oauth_/);
    expect(result).not.toHaveProperty('client_secret');
    expect(result).toMatchObject({
      client_name: 'Claude',
      grant_types: ['authorization_code'],
      redirect_uris: ['https://claude.ai/oauth/callback'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  it('rejects unsafe redirect URIs', async () => {
    const service = buildService();

    await Promise.all(
      [
        'http://attacker.example/callback',
        'ftp://localhost/callback',
        'javascript:alert(1)',
      ].map((redirectUri) =>
        expect(
          service.register({
            redirect_uris: [redirectUri],
          }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            error: 'invalid_client_metadata',
          }),
        }),
      ),
    );
  });

  it('accepts loopback and reverse-domain private-use redirects', async () => {
    const service = buildService();

    await expect(
      service.register({
        redirect_uris: [
          'http://127.0.0.1:43123/callback',
          'com.genfeed.desktop:/oauth/callback',
        ],
      }),
    ).resolves.toMatchObject({
      redirect_uris: [
        'http://127.0.0.1:43123/callback',
        'com.genfeed.desktop:/oauth/callback',
      ],
    });
  });

  it('rejects an unregistered redirect without redirecting to it', async () => {
    const service = buildService();
    const registered = await service.register({
      redirect_uris: ['https://claude.ai/oauth/callback'],
    });

    await expect(
      service.requireClient(
        registered.client_id,
        'https://attacker.example/callback',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_request' }),
    });
  });
});
