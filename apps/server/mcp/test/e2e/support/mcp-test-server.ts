import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@mcp/config/config.service';
import { getMcpWwwAuthenticateHeader } from '@mcp/mcp/setup-page';
import { AuthService } from '@mcp/services/auth.service';
import type { PostHogAnalyticsService } from '@mcp/services/posthog-analytics.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import type { McpRequest } from '@mcp/shared/interfaces/mcp-request.interface';
import { mcpAccessModeMiddleware } from '@mcp/shared/middleware/mcp-access-mode.middleware';
import { toolsetsQueryMiddleware } from '@mcp/shared/middleware/toolsets-query.middleware';
import { HttpService } from '@nestjs/axios';
import express, { type NextFunction, type Response } from 'express';

export interface McpToolCallResult {
  content?: Array<{ text?: string; type: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

export interface McpRpcResponse<TResult> {
  body: { error?: { code: number; message: string }; result?: TResult };
  headers: Headers;
  status: number;
}

export interface McpTestServer {
  callTool: (
    token: string | undefined,
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<McpRpcResponse<McpToolCallResult>>;
  close: () => Promise<void>;
  initialize: (
    token: string | undefined,
  ) => Promise<McpRpcResponse<{ serverInfo: { name: string } }>>;
  listTools: (
    token: string | undefined,
  ) => Promise<McpRpcResponse<{ tools: Array<{ name: string }> }>>;
}

const MODERN_PROTOCOL_VERSION = '2026-07-28';

const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  log: () => undefined,
  warn: () => undefined,
} as unknown as LoggerService;

function parseRpcBody(wire: string, contentType: string | null) {
  const text = contentType?.includes('text/event-stream')
    ? (wire
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6) ?? wire)
    : wire;
  return JSON.parse(text);
}

/**
 * Boots the production MCP request path (access-mode and toolset middleware,
 * `AuthService` token resolution, `StreamableHttpService`, the real tool
 * registry and role guard) against a Genfeed API at `apiBaseUrl`. Only the
 * Nest bootstrap, Redis rate limiter and analytics are left out.
 */
export async function startMcpTestServer(
  apiBaseUrl: string,
): Promise<McpTestServer> {
  const configService = {
    get: (key: string) =>
      key === 'GENFEEDAI_API_URL' ? apiBaseUrl : undefined,
  } as unknown as ConfigService;
  const httpService = new HttpService();
  const authService = new AuthService(httpService, configService, silentLogger);
  const streamableHttpService = new StreamableHttpService(
    silentLogger,
    httpService,
    configService,
    { instrumentServer: () => undefined } as unknown as PostHogAnalyticsService,
  );

  const authenticate = async (
    req: McpRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const token = authService.extractBearerToken(req.headers.authorization);
    const authResult = token
      ? await authService.authenticateRequest(token)
      : null;
    if (!token || !authResult?.valid) {
      res.setHeader(
        'WWW-Authenticate',
        getMcpWwwAuthenticateHeader(req.routeAccessMode),
      );
      res.status(401).json({
        error: {
          code: -32001,
          message: authResult?.error ?? 'Unauthorized',
        },
        id: null,
        jsonrpc: '2.0',
      });
      return;
    }
    req.authContext = {
      accessMode: authResult.accessMode,
      organizationId: authResult.organizationId,
      role: authResult.role || 'user',
      token,
      userId: authResult.userId,
    };
    next();
  };

  const app = express();
  app.post(
    ['/mcp', '/mcp/claude'],
    express.json({ limit: '1mb' }),
    mcpAccessModeMiddleware,
    toolsetsQueryMiddleware,
    authenticate,
    (req, res) => {
      streamableHttpService.handlePost(req, res).catch(() => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'unhandled' });
        }
      });
    },
  );

  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  let nextRequestId = 1;

  async function post<TResult>(
    token: string | undefined,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ): Promise<McpRpcResponse<TResult>> {
    const response = await fetch(endpoint, {
      body: JSON.stringify({ id: nextRequestId++, jsonrpc: '2.0', ...body }),
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        ...extraHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      method: 'POST',
    });
    const wire = await response.text();
    return {
      body: parseRpcBody(wire, response.headers.get('content-type')),
      headers: response.headers,
      status: response.status,
    };
  }

  function statelessRpc<TResult>(
    token: string | undefined,
    method: string,
    params: Record<string, unknown>,
  ): Promise<McpRpcResponse<TResult>> {
    const name = typeof params.name === 'string' ? params.name : undefined;
    return post<TResult>(
      token,
      {
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': {
              name: 'mcp-e2e',
              version: '1.0.0',
            },
            'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION,
          },
        },
      },
      {
        'MCP-Protocol-Version': MODERN_PROTOCOL_VERSION,
        'Mcp-Method': method,
        ...(name ? { 'Mcp-Name': name } : {}),
      },
    );
  }

  return {
    callTool: (token, name, args = {}) =>
      statelessRpc<McpToolCallResult>(token, 'tools/call', {
        arguments: args,
        name,
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    initialize: (token) =>
      post(token, {
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: { name: 'mcp-e2e', version: '1.0.0' },
          protocolVersion: '2025-03-26',
        },
      }),
    listTools: (token) => statelessRpc(token, 'tools/list', {}),
  };
}
