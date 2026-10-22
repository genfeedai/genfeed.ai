import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getMcpCatalogOperations } from '@genfeedai/actions';
import { getPublicMcpUrl, getPublicWebsiteUrl } from '@mcp/mcp/setup-page';
import { ClientService } from '@mcp/services/client.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { createMcpAuthMiddleware } from '@mcp/shared/middleware/mcp-auth.middleware';
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
  function buildApp(enforceAuthentication = false) {
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
    if (enforceAuthentication)
      app.use(
        createMcpAuthMiddleware({
          authService: {
            extractBearerToken: (header) =>
              header?.startsWith('Bearer ') ? header.slice(7) : null,
            authenticateRequest: async () => ({
              valid: true,
              role: 'user',
              organizationId: 'fixture-org',
              userId: 'fixture-user',
            }),
          },
          rateLimitService: {
            keyFor: () => 'synthetic',
            consume: async () => ({
              allowed: true,
              limit: 1000,
              remaining: 999,
              resetAt: Date.now() + 60000,
              retryAfterSeconds: 0,
            }),
          },
        }),
      );
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
    enforceAuthentication = false,
  ): Promise<void> {
    const server = http.createServer(buildApp(enforceAuthentication));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    try {
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('lists canonical tools, executes their branches and rejects retired names over both SDK transports', async () => {
    const list = vi
      .spyOn(ClientService.prototype, 'listSchedulerCapabilities')
      .mockResolvedValue([{ platform: 'youtube' }]);
    const validate = vi
      .spyOn(ClientService.prototype, 'validateSchedulerTarget')
      .mockResolvedValue({ validationState: 'valid' });
    const execute = vi
      .spyOn(ClientService.prototype, 'executeAgentTool')
      .mockResolvedValue({
        success: true,
        creditsUsed: 0,
        data: { assetId: 'fixture-asset' },
      });
    const approval = vi.spyOn(ClientService.prototype, 'createApproval');
    const inputs: Record<string, Record<string, unknown>> = {
      capabilities: {},
      validate: { platform: 'youtube' },
      request: { filename: 'photo.png', contentType: 'image/png' },
      complete: { assetId: 'fixture-asset' },
    };
    try {
      await withServer(async (baseUrl) => {
        const client = new LegacyClient({
          name: 'alias-regression',
          version: '1',
        });
        try {
          await client.connect(
            new LegacyTransport(new URL(`${baseUrl}/mcp`), {
              requestInit: {
                headers: { Authorization: 'Bearer fixture-auth' },
              },
            }),
          );
          const legacyList = await client.listTools();
          const modernList = await postModern(
            baseUrl,
            'tools/list',
            {},
            { Authorization: 'Bearer fixture-auth' },
          );
          for (const tools of [
            legacyList.tools,
            modernList.body.result.tools,
          ]) {
            const names = tools.map((tool: { name: string }) => tool.name);
            expect(names).toContain('check_channel');
            expect(names).toContain('upload_media');
            for (const operation of ['check_channel', 'upload_media'].flatMap(
              getMcpCatalogOperations,
            ))
              expect(names).not.toContain(operation.executionName);
          }
          for (const operation of ['check_channel', 'upload_media'].flatMap(
            getMcpCatalogOperations,
          )) {
            const input = inputs[operation.action];
            const methods = [list, validate, execute];
            const calls = [
              {
                name: operation.canonicalName,
                arguments: { action: operation.action, input },
              },
            ];
            for (const call of calls) {
              for (const method of methods) method.mockClear();
              const modern = await postModern(baseUrl, 'tools/call', call, {
                Authorization: 'Bearer fixture-auth',
              });
              expect(modern.body.error).toBeUndefined();
              expect(modern.body.result.isError).not.toBe(true);
              expect(
                methods.reduce(
                  (sum, method) => sum + method.mock.calls.length,
                  0,
                ),
              ).toBe(1);
              const modernCalls = methods.map((method) =>
                structuredClone(method.mock.calls),
              );
              for (const method of methods) method.mockClear();
              const legacy = await client.callTool(call);
              expect(legacy.isError).not.toBe(true);
              expect(methods.map((method) => method.mock.calls)).toEqual(
                modernCalls,
              );
              expect(legacy.structuredContent).toEqual(
                modern.body.result.structuredContent,
              );
            }
            for (const method of methods) method.mockClear();
            const retiredCall = {
              name: operation.executionName,
              arguments: input,
            };
            const rejectedModern = await postModern(
              baseUrl,
              'tools/call',
              retiredCall,
              {
                Authorization: 'Bearer fixture-auth',
              },
            );
            const rejectedLegacy = await client.callTool(retiredCall);
            for (const result of [rejectedModern.body.result, rejectedLegacy]) {
              expect(result.isError).toBe(true);
              expect(JSON.stringify(result)).toContain(
                `${operation.canonicalName}(action=${operation.action})`,
              );
            }
            expect(methodsCallCount()).toBe(0);
          }
          expect(approval).not.toHaveBeenCalled();
          for (const operation of ['check_channel', 'upload_media'].flatMap(
            getMcpCatalogOperations,
          )) {
            for (const name of [
              operation.canonicalName,
              operation.executionName,
            ]) {
              const before = methodsCallCount();
              const rejected = await postModern(baseUrl, 'tools/call', {
                name,
                arguments: {
                  action: operation.action,
                  input: inputs[operation.action],
                },
              });
              expect(
                rejected.body.result?.isError ?? Boolean(rejected.body.error),
              ).toBe(true);
              expect(methodsCallCount()).toBe(before);
            }
          }
        } finally {
          await client.close();
        }
      }, true);
    } finally {
      list.mockRestore();
      validate.mockRestore();
      execute.mockRestore();
      approval.mockRestore();
    }
    function methodsCallCount() {
      return (
        list.mock.calls.length +
        validate.mock.calls.length +
        execute.mock.calls.length
      );
    }
  });

  it('advertises output schemas on the modern and legacy wire', async () => {
    await withServer(async (baseUrl) => {
      const modern = await postModern(baseUrl, 'tools/list');
      const legacy = await postMcp(baseUrl, {
        id: 9,
        jsonrpc: '2.0',
        method: 'tools/list',
      });
      for (const listing of [modern.body, JSON.parse(legacy.text)]) {
        expect(listing.result.tools.length).toBeGreaterThan(0);
        for (const tool of listing.result.tools) {
          expect(tool).toHaveProperty(
            'outputSchema',
            expect.objectContaining({ type: 'object' }),
          );
        }
      }
    });
  });

  it('rejects a result that violates the advertised tool-specific schema on the wire', async () => {
    const malformed = {
      content: [{ type: 'text' as const, text: 'Account' }],
      structuredContent: { data: {} },
    };
    Object.defineProperty(malformed.structuredContent, 'data', { value: [] });
    const call = vi
      .spyOn(ToolRegistryService.prototype, 'handleToolCall')
      .mockResolvedValue(malformed);
    try {
      await withServer(async (baseUrl) => {
        const result = await postModern(baseUrl, 'tools/call', {
          name: 'get_account',
          arguments: { sections: ['profile'] },
        });
        expect(result.body.error).toBeDefined();
        expect(result.body.result).toBeUndefined();
      });
    } finally {
      call.mockRestore();
    }
  });

  it('returns structured text for a declined action without executing it', async () => {
    const notice = 'Approval declined. The action was not executed.';
    const call = vi
      .spyOn(ToolRegistryService.prototype, 'handleToolCall')
      .mockResolvedValue({
        content: [{ type: 'text', text: notice }],
      });
    try {
      await withServer(async (baseUrl) => {
        const result = await postModern(baseUrl, 'tools/call', {
          name: 'resolve_approval',
          arguments: { approvalId: 'fixture', decision: 'decline' },
        });
        expect(result.response.status).toBe(200);
        expect(result.body.result).toMatchObject({
          content: expect.arrayContaining([{ type: 'text', text: notice }]),
          structuredContent: { message: notice },
        });
        expect(call).toHaveBeenCalledOnce();
      });
    } finally {
      call.mockRestore();
    }
  });

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
