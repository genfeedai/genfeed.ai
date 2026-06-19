import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
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
      axiosRef: { create: () => ({ defaults: { headers: {} } }) },
    } as never;
    const configService = {
      get: (key: string) =>
        key === 'GENFEEDAI_API_URL' ? 'http://localhost:3010' : '',
    } as never;

    const service = new StreamableHttpService(
      logger,
      httpService,
      configService,
    );

    const app = express();
    app.use(express.json());
    app.post('/mcp', (req, res) => {
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
    const text = await res.text();
    return { status: res.status, text };
  }

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
