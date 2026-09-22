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
      grant_types: ['authorization_code', 'refresh_token'],
      redirect_uris: ['https://claude.ai/oauth/callback'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  it.each([
    'http://attacker.example/callback',
    'ftp://localhost/callback',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://app.genfeed.ai/uuid',
    'about:blank',
    'wss://attacker.example/callback',
    'https://claude.ai/callback#fragment',
    'https://attacker@claude.ai/callback',
    'not a url',
  ])(
    'rejects unsafe redirect URI %s with invalid_redirect_uri',
    async (redirectUri) => {
      const service = buildService();

      await expect(
        service.register({
          redirect_uris: [redirectUri],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          error: 'invalid_redirect_uri',
          error_description: expect.any(String),
        }),
      });
    },
  );

  it('rejects the whole registration when any one redirect is unsafe', async () => {
    const service = buildService();

    await expect(
      service.register({
        redirect_uris: [
          'https://claude.ai/oauth/callback',
          'javascript:alert(1)',
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'invalid_redirect_uri' }),
    });
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

  it('accepts the single-label private-use scheme Cursor and Grok Bot register (#4948)', async () => {
    const service = buildService();
    const cursorRedirect = 'cursor://anysphere.cursor-mcp/oauth/callback';

    const registered = await service.register({
      client_name: 'Cursor',
      redirect_uris: [cursorRedirect],
    });

    expect(registered.redirect_uris).toEqual([cursorRedirect]);
    await expect(
      service.requireClient(registered.client_id, cursorRedirect),
    ).resolves.toMatchObject({ redirectUris: [cursorRedirect] });
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
