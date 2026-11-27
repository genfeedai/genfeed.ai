import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createWideEventMiddleware } from '@libs/logger/wide-event/wide-event.http';
import type { WideEventRecord } from '@libs/logger/wide-event/wide-event.interface';
import { ClientService } from '@mcp/services/client.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import express from 'express';

const SECRET_PROMPT = 'launch-plan-for-the-secret-customer';

/** The real handler behind the real wide event middleware; only the API is stubbed. */
async function withMcpServer(
  fn: (
    call: (body: unknown) => Promise<void>,
    events: WideEventRecord[],
  ) => Promise<void>,
): Promise<void> {
  const events: WideEventRecord[] = [];
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as never;
  const service = new StreamableHttpService(
    logger,
    { axiosRef: { create: () => ({ defaults: { headers: {} } }) } } as never,
    { get: () => '' } as never,
    { instrumentServer: () => undefined } as never,
  );
  const app = express();
  app.use(
    createWideEventMiddleware({
      identity: { service: 'mcp', version: 'test' },
      sink: { wideEvent: (event) => events.push(event) },
    }),
  );
  app.use(express.json());
  app.post('/mcp', (req: McpRequest, res) => {
    req.authContext = {
      token: 'fixture-token',
      role: 'user',
      organizationId: 'fixture-org',
      hasBrandKitEditAccess: true,
    };
    req.routeAccessMode = 'standard';
    service.handlePost(req, res).catch(() => res.status(500).end());
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const call = async (body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    await response.text();
    // The event is emitted when the response finishes.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };
  try {
    await fn(call, events);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('the request event of a POST /mcp', () => {
  beforeEach(() => {
    // Fast successes are sampled at 5%; pin the draw so the event is kept.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the tool of a tools/call and carries none of its arguments', async () => {
    vi.spyOn(ClientService.prototype, 'executeAgentTool').mockResolvedValue({
      success: true,
      creditsUsed: 0,
      data: {},
    });

    await withMcpServer(async (call, events) => {
      await call({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_brands',
          arguments: { prompt: SECRET_PROMPT, brandId: 'brand-123' },
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: 'http',
        mcp: { method: 'tools/call', tool_name: 'get_brands' },
        path: '/mcp',
      });
      expect(JSON.stringify(events[0])).not.toContain(SECRET_PROMPT);
      expect(JSON.stringify(events[0])).not.toContain('brand-123');
    });
  });

  it('records the method alone for tools/list', async () => {
    await withMcpServer(async (call, events) => {
      await call({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

      expect(events[0]?.mcp).toEqual({ method: 'tools/list' });
    });
  });

  it('does not copy a tool name that is not a name', async () => {
    await withMcpServer(async (call, events) => {
      await call({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: `${SECRET_PROMPT} with spaces and more`,
          arguments: {},
        },
      });

      expect(events[0]?.mcp).toEqual({
        method: 'tools/call',
        tool_name: 'invalid',
      });
      expect(JSON.stringify(events[0])).not.toContain(SECRET_PROMPT);
    });
  });
});
