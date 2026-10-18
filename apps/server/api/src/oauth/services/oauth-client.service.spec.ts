import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { safeFetch } from '@libs/security/destination-guard';
import { OAuthClientService } from './oauth-client.service';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

beforeEach(() => {
  vi.mocked(safeFetch).mockReset();
});

function buildService(upsert = vi.fn().mockResolvedValue(undefined)) {
  const clients = new Map<string, Record<string, unknown>>();
  const prisma = {
    oAuthClient: {
      upsert,
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

describe('OAuth CIMD clients', () => {
  const clientId = 'https://client.example/oauth/metadata.json';
  const metadata = {
    client_id: clientId,
    client_name: 'Document client',
    redirect_uris: ['https://client.example/callback'],
    token_endpoint_auth_method: 'none',
  };
  function documentResponse(
    value: unknown = metadata,
    headers: Record<string, string> = {},
  ) {
    return new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json', ...headers },
    });
  }

  it('persists validated CIMD metadata for grant foreign keys and checks redirects without DCR', async () => {
    vi.mocked(safeFetch).mockResolvedValue(documentResponse());
    const upsert = vi.fn().mockResolvedValue(undefined);
    const service = buildService(upsert);
    await expect(
      service.requireClient(clientId, metadata.redirect_uris[0]),
    ).resolves.toMatchObject({
      clientId,
      clientName: 'Document client',
      redirectUris: metadata.redirect_uris,
      grantTypes: ['authorization_code'],
      tokenEndpointAuthMethod: 'none',
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { clientId },
      create: expect.objectContaining({
        clientId,
        redirectUris: metadata.redirect_uris,
      }),
      update: expect.objectContaining({ redirectUris: metadata.redirect_uris }),
    });
    expect(safeFetch).toHaveBeenCalledWith(
      clientId,
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
      { allowedSchemes: ['https:'], maxRedirects: 0 },
    );
    await expect(
      service.requireClient(clientId, 'https://attacker.example/callback'),
    ).rejects.toMatchObject({ response: { error: 'invalid_request' } });
  });

  it.each([
    'http://client.example/metadata.json',
    'https://client.example/',
    'https://user:password@client.example/metadata.json',
    'https://client.example/metadata.json#fragment',
  ])(
    'rejects invalid client document identifier %s before fetching',
    async (id) => {
      await expect(buildService().requireClient(id)).rejects.toMatchObject({
        response: { error: 'invalid_client' },
      });
      expect(safeFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...metadata, client_id: 'https://other.example/client.json' },
    { ...metadata, client_name: undefined },
    { ...metadata, redirect_uris: [] },
    { ...metadata, redirect_uris: ['javascript:alert(1)'] },
    { ...metadata, token_endpoint_auth_method: 'client_secret_post' },
  ])('rejects invalid document metadata %j', async (document) => {
    vi.mocked(safeFetch).mockResolvedValue(documentResponse(document));
    await expect(buildService().requireClient(clientId)).rejects.toMatchObject({
      response: { error: 'invalid_client' },
    });
  });

  it('fails closed when the outbound guard rejects a private address or DNS rebinding target', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('blocked destination'));
    await expect(
      buildService().requireClient('https://127.0.0.1/metadata.json'),
    ).rejects.toMatchObject({ response: { error: 'invalid_client' } });
  });

  it('rejects non-JSON and oversized documents', async () => {
    const service = buildService();
    vi.mocked(safeFetch).mockResolvedValue(
      new Response('<html>oops</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(service.requireClient(clientId)).rejects.toMatchObject({
      response: { error: 'invalid_client' },
    });
    vi.mocked(safeFetch).mockResolvedValue(
      documentResponse({ ...metadata, extra: 'x'.repeat(65536) }),
    );
    await expect(service.requireClient(clientId)).rejects.toMatchObject({
      response: { error: 'invalid_client' },
    });
  });

  it('rejects redirects and never follows a document to another destination', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/' },
      }),
    );
    await expect(buildService().requireClient(clientId)).rejects.toMatchObject({
      response: { error: 'invalid_client' },
    });
  });

  describe('loopback redirects (RFC 8252 §7.3)', () => {
    const loopbackMetadata = {
      ...metadata,
      redirect_uris: ['http://127.0.0.1/callback', 'http://localhost/callback'],
    };

    it.each([
      'http://127.0.0.1:49323/callback',
      'http://127.0.0.1/callback',
      'http://localhost:8123/callback',
    ])('accepts %s for a portless loopback registration', async (redirect) => {
      vi.mocked(safeFetch).mockResolvedValue(
        documentResponse(loopbackMetadata),
      );
      await expect(
        buildService().requireClient(clientId, redirect),
      ).resolves.toMatchObject({ clientId });
    });

    it.each([
      'http://127.0.0.1:49323/other',
      'http://127.0.0.1:49323/callback?next=1',
      'http://[::1]:49323/callback',
      'http://127.0.0.2:49323/callback',
      'https://127.0.0.1:49323/callback',
      'http://evil.example:49323/callback',
    ])('rejects %s', async (redirect) => {
      vi.mocked(safeFetch).mockResolvedValue(
        documentResponse(loopbackMetadata),
      );
      await expect(
        buildService().requireClient(clientId, redirect),
      ).rejects.toMatchObject({
        response: { error_description: 'Unregistered redirect URI' },
      });
    });

    it('does not ignore the port of a non-loopback http or https redirect', async () => {
      vi.mocked(safeFetch).mockResolvedValue(documentResponse());
      await expect(
        buildService().requireClient(
          clientId,
          'https://client.example:8443/callback',
        ),
      ).rejects.toMatchObject({
        response: { error_description: 'Unregistered redirect URI' },
      });
    });
  });

  it('honors no-store', async () => {
    const service = buildService();
    vi.mocked(safeFetch).mockImplementation(async () =>
      documentResponse(metadata, { 'cache-control': 'no-store' }),
    );
    await service.requireClient(clientId);
    await service.requireClient(clientId);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });
});

it('expires cached CIMD documents after at most five minutes', async () => {
  vi.useFakeTimers();
  try {
    const clientId = 'https://client.example/metadata.json';
    vi.mocked(safeFetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            client_id: clientId,
            client_name: 'Test',
            redirect_uris: ['https://client.example/callback'],
          }),
          {
            headers: {
              'content-type': 'application/json',
              'cache-control': 'max-age=999999',
            },
          },
        ),
    );
    const service = buildService();
    await service.requireClient(clientId);
    await service.requireClient(clientId);
    expect(safeFetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300_001);
    await service.requireClient(clientId);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
