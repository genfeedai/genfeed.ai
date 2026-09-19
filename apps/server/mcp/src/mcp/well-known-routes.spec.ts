import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import {
  MCP_SERVER_CARD_PATHS,
  registerWellKnownRoutes,
} from '@mcp/mcp/well-known-routes';
import express from 'express';

/**
 * Exercises the real Express route table `main.ts` mounts, without booting
 * Nest (no Redis or API here). Node's global `fetch` stands in for a browser
 * client fetching discovery documents cross-origin.
 */
async function listen(): Promise<{ baseUrl: string; server: Server }> {
  const app = express();
  registerWellKnownRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('registerWellKnownRoutes', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(() => {
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.genfeed.ai');
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', '');
    vi.stubEnv('GENFEEDAI_MICROSERVICES_MCP_URL', '');
  });

  afterEach(async () => {
    if (server) await close(server);
    vi.unstubAllEnvs();
  });

  it('serves byte-identical protected-resource metadata at the bare and path-suffixed locations, cross-origin (#4553 defects 2 and 4)', async () => {
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', 'https://mcp.genfeed.ai');
    ({ baseUrl, server } = await listen());

    const [bare, suffixed] = await Promise.all([
      fetch(`${baseUrl}/.well-known/oauth-protected-resource`),
      fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`),
    ]);

    expect(bare.status).toBe(200);
    expect(suffixed.status).toBe(200);
    for (const response of [bare, suffixed]) {
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('cache-control')).toBe('public, max-age=300');
      expect(response.headers.get('content-type')).toContain(
        'application/json',
      );
    }

    const [bareBody, suffixedBody] = await Promise.all([
      bare.text(),
      suffixed.text(),
    ]);
    expect(suffixedBody).toBe(bareBody);
    expect(JSON.parse(bareBody)).toEqual({
      authorization_servers: ['https://api.genfeed.ai'],
      bearer_methods_supported: ['header'],
      resource: 'https://mcp.genfeed.ai/mcp',
      resource_name: 'Genfeed MCP',
      scopes_supported: [...API_KEY_SCOPE_PRESETS.mcp],
    });
  });

  it('suffixes the well-known path with the full resource path, not just /mcp', async () => {
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', 'https://self-hosted.test/genfeed/');
    ({ baseUrl, server } = await listen());

    const suffixed = await fetch(
      `${baseUrl}/.well-known/oauth-protected-resource/genfeed/mcp`,
    );
    const wrongSuffix = await fetch(
      `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
    );

    expect(suffixed.status).toBe(200);
    expect(wrongSuffix.status).toBe(404);
    await expect(suffixed.json()).resolves.toMatchObject({
      resource: 'https://self-hosted.test/genfeed/mcp',
    });
  });

  it.each(MCP_SERVER_CARD_PATHS)(
    'keeps the server card at %s cross-origin',
    async (path) => {
      ({ baseUrl, server } = await listen());

      const response = await fetch(`${baseUrl}${path}`);

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      await expect(response.json()).resolves.toMatchObject({
        name: 'genfeed-mcp-server',
        transport: { endpoint: 'https://mcp.genfeed.ai/mcp' },
      });
    },
  );
});
