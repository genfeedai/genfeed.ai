import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AuthService } from '@mcp/services/auth.service';
import { ClientService } from '@mcp/services/client.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { createMcpAuthMiddleware } from '@mcp/shared/middleware/mcp-auth.middleware';
import express from 'express';
import { defer } from 'rxjs';

const SESSION_TOKEN = 'session-token-0123456789-0123456789-abcdef';
const API_KEY = 'gf_0123456789012345678901234567890123456789';

const ORGANIZATIONS = [
  { id: 'org-1', isActive: true, label: 'Acme', slug: 'acme' },
  { id: 'org-2', isActive: false, label: 'Globex', slug: 'globex' },
];

/** The real auth middleware, auth service and MCP handler; only the API is a counting double. */
async function withMcpServer(
  fn: (
    callTool: (token: string) => Promise<void>,
    counts: { identity: number; organizations: number },
  ) => Promise<void>,
): Promise<void> {
  const counts = { identity: 0, organizations: 0 };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  /** The API takes a while to answer, so parallel calls overlap with it. */
  const slowAnswer = async () => {
    for (let round = 0; round < 25; round += 1) await tick();
  };
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as never;
  const configService = {
    get: (key: string) =>
      key === 'GENFEEDAI_API_URL' ? 'http://localhost:3010' : '',
  } as never;
  const authService = new AuthService(
    {
      get: (url: string) =>
        defer(async () => {
          if (url.endsWith('/auth/whoami')) counts.identity += 1;
          await slowAnswer();
          return {
            data: {
              data: {
                canSwitchOrganizations: true,
                organization: { id: 'org-1' },
                role: 'owner',
                user: { id: 'user-1' },
              },
            },
            status: 200,
          };
        }),
    } as never,
    configService,
    logger,
  );
  const apiClient = {
    defaults: { headers: {} as Record<string, string> },
    get: async (path: string) => {
      if (path === '/auth/whoami') counts.identity += 1;
      if (path === '/organizations') counts.organizations += 1;
      await slowAnswer();
      return path === '/organizations'
        ? { data: { data: ORGANIZATIONS } }
        : { data: { data: {} } };
    },
    post: async () => {
      await tick();
      return { data: { creditsUsed: 0, data: {}, success: true } };
    },
  };
  const service = new StreamableHttpService(
    logger,
    { axiosRef: { create: () => apiClient } } as never,
    configService,
    { instrumentServer: () => undefined } as never,
  );

  const app = express();
  app.use(express.json());
  app.use(
    createMcpAuthMiddleware({
      authService,
      rateLimitService: {
        consume: async () => ({
          allowed: true,
          limit: 1000,
          remaining: 999,
          resetAt: Date.now() + 60_000,
          retryAfterSeconds: 0,
        }),
        keyFor: () => 'synthetic',
      },
    } as never),
  );
  app.post('/mcp', (req: McpRequest, res) => {
    req.routeAccessMode = 'standard';
    service.handlePost(req, res).catch(() => res.status(500).end());
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const callTool = async (token: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { arguments: { organization: 'acme' }, name: 'get_brands' },
      }),
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    await response.text();
  };
  try {
    await fn(callTool, counts);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('parallel tool calls on one connection', () => {
  beforeEach(() => {
    vi.spyOn(ClientService.prototype, 'executeAgentTool').mockResolvedValue({
      creditsUsed: 0,
      data: {},
      success: true,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('make one identity lookup and one organization listing for five calls on a session token', async () => {
    await withMcpServer(async (callTool, counts) => {
      await Promise.all(
        Array.from({ length: 5 }, () => callTool(SESSION_TOKEN)),
      );

      expect(counts).toEqual({ identity: 1, organizations: 1 });
    });
  });

  it('still look up the identity of a gf_ key on every request', async () => {
    await withMcpServer(async (callTool, counts) => {
      await callTool(API_KEY);
      await callTool(API_KEY);
      await callTool(API_KEY);

      expect(counts.identity).toBe(3);
    });
  });
});
