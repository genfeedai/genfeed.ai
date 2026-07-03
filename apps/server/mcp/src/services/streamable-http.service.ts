import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { type McpRole } from '@mcp/services/auth.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

interface AuthContext {
  token?: string;
  userId?: string;
  organizationId?: string;
  role?: McpRole;
}

interface AuthenticatedRequest extends Request {
  authContext?: AuthContext;
  body: unknown;
}

/**
 * Stateless Streamable HTTP transport for the MCP server.
 *
 * The MCP SDK's `StreamableHTTPServerTransport` runs in one of two modes. With a
 * `sessionIdGenerator` it is *stateful*: it assigns `transport.sessionId` on the
 * initialize request and the caller is expected to retain the transport keyed by
 * that id. With `sessionIdGenerator: undefined` it is *stateless*: it never
 * assigns a session id and refuses to be reused across requests ("Stateless
 * transport cannot be reused across requests. Create a new transport per
 * request."). The previous implementation mixed the two — it configured
 * stateless mode but then read `transport.sessionId` and threw when it was
 * falsy, which it always is in stateless mode, so every request crashed.
 *
 * This implementation is fully stateless: a fresh `Server` + transport is built
 * per request, the request is handled, and both are torn down in a `finally`.
 * No session map, no cleanup timer. Mirrors the Vitae MCP reference transport.
 */
@Injectable()
export class StreamableHttpService {
  constructor(
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async handlePost(req: Request, res: Response): Promise<void> {
    await this.processRequest(req, res);
  }

  async handleGet(req: Request, res: Response): Promise<void> {
    await this.processRequest(req, res);
  }

  async handleDelete(req: Request, res: Response): Promise<void> {
    await this.processRequest(req, res);
  }

  /**
   * Handle a single MCP request with a throwaway server + transport. The SDK's
   * `handleRequest` performs method-appropriate handling (JSON-RPC over POST;
   * 405 for GET/DELETE in stateless mode), so all HTTP verbs route here.
   */
  private async processRequest(req: Request, res: Response): Promise<void> {
    const authContext = (req as AuthenticatedRequest).authContext;
    const server = this.buildServer(authContext);
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      // The raw `/mcp` Express routes are registered before NestJS installs its
      // body parser, so `req.body` is usually undefined here; pass it through
      // explicitly so the SDK reads the raw stream as a fallback. This stays
      // correct even if a body parser runs first.
      await transport.handleRequest(
        req,
        res,
        (req as AuthenticatedRequest).body ?? undefined,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to handle MCP request', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: { code: -32603, message: 'Internal server error' },
          id: null,
          jsonrpc: '2.0',
        });
      }
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  }

  private buildServer(authContext?: AuthContext): Server {
    const clientService = this.createClientService(authContext?.token);
    const toolRegistry = new ToolRegistryService(
      clientService,
      this.logger,
      authContext?.role ?? 'user',
    );

    const server = new Server(
      {
        name: 'genfeed-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: toolRegistry.getTools(),
    }));

    server.setRequestHandler(
      CallToolRequestSchema,
      async (request: { params: unknown }) =>
        toolRegistry.handleToolCall(
          request.params as {
            name: string;
            arguments: Record<string, unknown>;
          },
        ),
    );

    server.setRequestHandler(ListResourcesRequestSchema, () => ({
      resources: toolRegistry.getResources(),
    }));

    server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: { params: unknown }) =>
        toolRegistry.handleResourceRead(request.params as { uri: string }),
    );

    return server;
  }

  private createClientService(bearerToken?: string): ClientService {
    const client = new ClientService(
      this.logger,
      this.httpService,
      this.configService,
    );

    if (bearerToken) {
      client.setBearerToken(bearerToken);
    }

    return client;
  }
}
