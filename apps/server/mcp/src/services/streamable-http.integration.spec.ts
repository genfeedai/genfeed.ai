import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPublicMcpUrl, getPublicWebsiteUrl } from '@mcp/mcp/setup-page';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { ACCOUNT_AVATAR_ORIGINS } from '@mcp/ui/avatar-origins';
import { MCP_APP_MIME_TYPE, MCP_CARD_RESOURCE_URI } from '@mcp/ui/card-data';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import express from 'express';

/**
 * Integration test that exercises the REAL MCP SDK transport (no SDK mocks)
 * through a real Express + HTTP server, proving the stateless transport
 * actually serves a JSON-RPC `initialize` — the exact request that previously
 * threw "Transport did not generate a session ID" and 500'd every call.
 */
describe('StreamableHttpService (real SDK integration)', () => {
  function buildApp() {
    const logger = {
      debug: () => undefined,
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    } as never;
    const httpService = {
      axiosRef: {
        create: () => {
          const defaults = { headers: { Authorization: '' } };
          return {
            defaults,
            post: async () => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              return {
                data: {
                  success: true,
                  data: { caller: defaults.headers.Authorization },
                },
              };
            },
          };
        },
      },
    } as never;
    const configService = {
      get: (key: string) =>
        key === 'GENFEEDAI_API_URL' ? 'http://localhost:3010' : '',
    } as never;
    const analyticsService = {
      instrumentServer: () => undefined,
    } as never;

    const service = new StreamableHttpService(
      logger,
      httpService,
      configService,
      analyticsService,
    );

    const app = express();
    app.use(express.json());
    app.post(['/mcp', '/mcp/claude'], (req: McpRequest, res) => {
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      if (token)
        req.authContext = { token, role: 'user', organizationId: token };
      req.routeAccessMode = req.path.endsWith('/claude')
        ? 'claude'
        : 'standard';
      service.handlePost(req, res).catch(() => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'unhandled' });
        }
      });
    });
    return app;
  }

  async function withServer(
    fn: (baseUrl: string) => Promise<void>,
  ): Promise<void> {
    const server = http.createServer(buildApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('serves portable card metadata and HTML over the real SDK', async () => {
    await withServer(async (baseUrl) => {
      const listing = await postMcp(baseUrl, {
        id: 10,
        jsonrpc: '2.0',
        method: 'tools/list',
      });
      expect(listing.status).toBe(200);
      expect(JSON.parse(listing.text).result.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'get_posts',
            _meta: expect.objectContaining({
              ui: { resourceUri: MCP_CARD_RESOURCE_URI },
            }),
          }),
          expect.objectContaining({
            name: 'list_assets',
            _meta: expect.objectContaining({
              ui: { resourceUri: MCP_CARD_RESOURCE_URI },
            }),
          }),
        ]),
      );
      const resource = await postMcp(baseUrl, {
        id: 11,
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri: MCP_CARD_RESOURCE_URI },
      });
      expect(resource.status).toBe(200);
      const content = JSON.parse(resource.text).result.contents[0];
      expect(content).toMatchObject({
        uri: MCP_CARD_RESOURCE_URI,
        mimeType: MCP_APP_MIME_TYPE,
        _meta: {
          ui: {
            csp: {
              connectDomains: [],
              resourceDomains: [
                'https://cdn.genfeed.ai',
                ...ACCOUNT_AVATAR_ORIGINS,
                'https://mcp.genfeed.ai',
              ],
            },
          },
        },
      });
      expect(content.text).toContain('ui/initialize');
      expect(content.text).toContain('ui/notifications/tool-result');
    });
  });

  const initializeBody = {
    id: 1,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'integration-test', version: '1.0.0' },
      protocolVersion: '2025-03-26',
    },
  };

  async function postMcp(baseUrl: string, body: unknown) {
    const res = await fetch(`${baseUrl}/mcp`, {
      body: JSON.stringify(body),
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const wire = await res.text();
    const text = res.headers.get('content-type')?.includes('text/event-stream')
      ? (wire
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6) ?? wire)
      : wire;
    return { status: res.status, text };
  }

  function modernBody(method: string, params: Record<string, unknown> = {}) {
    return {
      id: 20,
      jsonrpc: '2.0',
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': {
            name: 'modern-test',
            version: '1',
          },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    };
  }

  async function postModern(
    baseUrl: string,
    method: string,
    params: Record<string, unknown> = {},
    headers: Record<string, string> = {},
    route = '/mcp',
  ) {
    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': method,
        ...(typeof params.name === 'string'
          ? { 'Mcp-Name': params.name }
          : typeof params.uri === 'string'
            ? { 'Mcp-Name': params.uri }
            : {}),
        ...headers,
      },
      body: JSON.stringify(modernBody(method, params)),
    });
    return { response, body: await response.json() };
  }

  it('serves modern discovery and tool listing without initialize or a session', async () => {
    await withServer(async (baseUrl) => {
      const discovery = await postModern(baseUrl, 'server/discover');
      expect(discovery.response.status).toBe(200);
      expect(discovery.response.headers.has('mcp-session-id')).toBe(false);
      expect(discovery.body.result).toMatchObject({
        capabilities: { tools: {}, resources: {} },
      });
      const listing = await postModern(baseUrl, 'tools/list');
      expect(listing.response.status).toBe(200);
      expect(listing.body.result.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'get_posts' }),
        ]),
      );
    });
  });

  it('serves public card resources and safe tool failures over the modern wire', async () => {
    await withServer(async (baseUrl) => {
      const resource = await postModern(baseUrl, 'resources/read', {
        uri: MCP_CARD_RESOURCE_URI,
      });
      expect(resource.response.status).toBe(200);
      expect(resource.body.result.contents[0]).toMatchObject({
        uri: MCP_CARD_RESOURCE_URI,
        mimeType: MCP_APP_MIME_TYPE,
      });
      const call = await postModern(baseUrl, 'tools/call', {
        name: 'unknown_audit_tool',
        arguments: {},
      });
      expect(call.response.status).toBe(200);
      expect(call.body.result.isError).toBe(true);
    });
  });

  it('keeps concurrent tool calls bound to each request bearer identity', async () => {
    await withServer(async (baseUrl) => {
      const callers = ['gf_first_tenant', 'gf_second_tenant'];
      const results = await Promise.all(
        callers.map((token) =>
          postModern(
            baseUrl,
            'tools/call',
            { name: 'get_account', arguments: {} },
            { Authorization: `Bearer ${token}` },
          ),
        ),
      );
      for (const [index, result] of results.entries()) {
        expect(result.response.status).toBe(200);
        expect(result.body.result.isError).not.toBe(true);
        expect(JSON.stringify(result.body.result)).toContain(callers[index]);
        expect(JSON.stringify(result.body.result)).not.toContain(
          callers[1 - index],
        );
      }
    });
  });

  it('preserves Claude restrictions on modern calls and discovery', async () => {
    await withServer(async (baseUrl) => {
      const listing = await postModern(
        baseUrl,
        'tools/list',
        {},
        {},
        '/mcp/claude',
      );
      expect(listing.response.status).toBe(200);
      expect(
        listing.body.result.tools.some(
          (tool: { name: string }) => tool.name === 'generate',
        ),
      ).toBe(false);
      const call = await postModern(
        baseUrl,
        'tools/call',
        { name: 'generate', arguments: {} },
        {},
        '/mcp/claude',
      );
      expect(call.body.result.isError).toBe(true);
      expect(call.body.result.structuredContent.code).toBe(
        'unavailable_in_connector',
      );
    });
  });

  it('supports an unchanged SDK v1 client on the dual-era endpoint', async () => {
    await withServer(async (baseUrl) => {
      const client = new LegacyClient({
        name: 'legacy-regression',
        version: '1',
      });
      try {
        await client.connect(new LegacyTransport(new URL(`${baseUrl}/mcp`)));
        const listing = await client.listTools();
        expect(listing.tools).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'get_posts' }),
          ]),
        );
      } finally {
        await client.close();
      }
    });
  });

  it('rejects mismatched routing headers instead of dispatching the body method', async () => {
    await withServer(async (baseUrl) => {
      const { response, body } = await postModern(
        baseUrl,
        'tools/list',
        {},
        { 'Mcp-Method': 'resources/list' },
      );
      expect(response.status).toBe(400);
      expect(body.error.code).toBe(-32020);
    });
  });

  it('rejects malformed modern envelopes without falling back to legacy dispatch', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'tools/list',
        },
        body: JSON.stringify({
          id: 30,
          jsonrpc: '2.0',
          method: 'tools/list',
          params: { _meta: { 'io.modelcontextprotocol/protocolVersion': 42 } },
        }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBeDefined();
    });
  });

  it('rejects unsupported modern revisions', async () => {
    await withServer(async (baseUrl) => {
      const body = modernBody('tools/list');
      body.params._meta['io.modelcontextprotocol/protocolVersion'] =
        '2099-01-01';
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2099-01-01',
          'Mcp-Method': 'tools/list',
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(-32022);
    });
  });

  it('serves a JSON-RPC initialize without throwing a session error', async () => {
    await withServer(async (baseUrl) => {
      const { status, text } = await postMcp(baseUrl, initializeBody);

      expect(status).toBe(200);
      expect(text).not.toContain('Transport did not generate a session ID');

      const body = JSON.parse(text);
      expect(body).toMatchObject({
        id: 1,
        jsonrpc: '2.0',
        result: {
          protocolVersion: expect.any(String),
          serverInfo: { name: 'genfeed-mcp-server' },
        },
      });
    });
  });

  it('brands the server identity in initialize (#6134)', async () => {
    await withServer(async (baseUrl) => {
      const { status, text } = await postMcp(baseUrl, {
        ...initializeBody,
        params: { ...initializeBody.params, protocolVersion: '2025-11-25' },
      });

      expect(status).toBe(200);
      const { result } = JSON.parse(text);
      expect(result.protocolVersion).toBe('2025-11-25');
      expect(result.instructions).toContain('get_brands');
      expect(result.serverInfo).toMatchObject({
        description: expect.stringContaining('Genfeed'),
        name: 'genfeed-mcp-server',
        title: 'Genfeed',
        version: expect.any(String),
        websiteUrl: getPublicWebsiteUrl(),
      });

      const icons: Array<{
        mimeType: string;
        sizes: string[];
        src: string;
        theme?: string;
      }> = result.serverInfo.icons;
      const mcpOrigin = new URL(getPublicMcpUrl()).origin;
      expect(icons.map((icon) => icon.mimeType)).toEqual(
        expect.arrayContaining(['image/png', 'image/svg+xml']),
      );
      expect(icons.map((icon) => icon.theme)).toEqual(
        expect.arrayContaining(['light', 'dark']),
      );
      for (const icon of icons) {
        // Clients verify icons are same-origin with the server and HTTPS.
        expect(new URL(icon.src).origin).toBe(mcpOrigin);
        expect(icon.sizes.length).toBeGreaterThan(0);
      }
    });
  });

  it('handles repeated independent initialize requests (per-request transport, no reuse error)', async () => {
    await withServer(async (baseUrl) => {
      for (const id of [1, 2, 3]) {
        const { status, text } = await postMcp(baseUrl, {
          ...initializeBody,
          id,
        });

        expect(status).toBe(200);
        expect(text).not.toContain('Stateless transport cannot be reused');
        expect(JSON.parse(text).id).toBe(id);
      }
    });
  });
});
