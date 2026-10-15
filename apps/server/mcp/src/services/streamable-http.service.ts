import type { ToolsetName } from '@genfeedai/actions';
import {
  type McpAccessMode,
  mostRestrictiveMcpAccessMode,
} from '@genfeedai/actions';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import {
  buildClaudeMcpServerInstructions,
  getMcpServerInfo,
  MCP_SERVER_INSTRUCTIONS,
} from '@mcp/mcp/server-identity';
import { getPublicMcpUrl, getPublicWebsiteUrl } from '@mcp/mcp/setup-page';
import { ClientService } from '@mcp/services/client.service';
import { PostHogAnalyticsService } from '@mcp/services/posthog-analytics.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import type {
  McpAuthContext,
  McpRequest,
} from '@mcp/shared/interfaces/mcp-request.interface';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/core';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, Server } from '@modelcontextprotocol/server';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * The `/mcp` POST route uses a route-scoped JSON parser (see `main.ts`), so
 * `body` is `unknown` rather than express's default `any`; GET/DELETE never
 * populate it.
 */
interface StatelessMcpRequest extends McpRequest {
  body: unknown;
}

/** Serves modern MCP requests and legacy stateless clients from one scoped factory. */
@Injectable()
export class StreamableHttpService {
  /**
   * Whether the `/mcp` Express routes are live. Each request builds a throwaway
   * `Server` + transport pair, so there is no long-lived object to poll —
   * "ready" means the bootstrap in `main.ts` mounted the routes that create
   * them. Health and manifest endpoints report this, and nothing else.
   */
  private isTransportMounted = false;

  constructor(
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly analyticsService: PostHogAnalyticsService,
  ) {}

  /**
   * Called once by the bootstrap after the `/mcp` POST/GET/DELETE routes are
   * registered on the Express instance.
   */
  markTransportMounted(): void {
    this.isTransportMounted = true;
    this.logger.log('MCP Streamable HTTP transport mounted at /mcp');
  }

  isTransportReady(): boolean {
    return this.isTransportMounted;
  }

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
    const request = req as StatelessMcpRequest;
    const authContext = request.authContext;
    // Parsed by `toolsetsQueryMiddleware` before authentication runs, so this
    // is populated for unauthenticated public `tools/list` requests too.
    const toolsets = request.toolsets ?? [];
    const handler = createMcpHandler(
      () => this.buildServer(authContext, toolsets, request.routeAccessMode),
      {
        legacy: 'stateless',
        responseMode: 'auto',
        maxRequestBodySize: 1024 * 1024,
        onerror: (error) => this.logger.error('MCP handler failed', error),
      },
    );
    const handleRequest = toNodeHandler(handler, {
      maxRequestBodySize: 1024 * 1024,
      onerror: (error) =>
        this.logger.error('MCP request adapter failed', error),
    });

    try {
      // POST requests use a route-scoped JSON parser so the authentication
      // boundary can classify public discovery methods. GET/DELETE have no
      // body, and the SDK accepts `undefined` for those verbs.
      await handleRequest(req, res, request.body ?? undefined);
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
      await handler.close().catch(() => undefined);
    }
  }

  private buildServer(
    authContext?: McpAuthContext,
    toolsets: readonly ToolsetName[] = [],
    routeAccessMode: McpAccessMode = 'standard',
  ): Server {
    const accessMode = mostRestrictiveMcpAccessMode(
      routeAccessMode,
      authContext?.accessMode,
    );
    const clientService = this.createClientService(authContext?.token);
    const toolRegistry = new ToolRegistryService(
      clientService,
      this.logger,
      authContext?.role ?? 'user',
      toolsets,
      this.configService,
      accessMode,
    );

    const serverInfo = getMcpServerInfo(
      getPublicMcpUrl(),
      getPublicWebsiteUrl(),
      accessMode,
    );
    const server = new Server(serverInfo, {
      capabilities: {
        resources: {},
        tools: {},
      },
      instructions:
        accessMode === 'claude'
          ? buildClaudeMcpServerInstructions()
          : MCP_SERVER_INSTRUCTIONS,
    });

    server.setRequestHandler('tools/list', () =>
      ListToolsResultSchema.parse({ tools: toolRegistry.getTools() }),
    );

    server.setRequestHandler('tools/call', async (request) => {
      const result = await toolRegistry.handleToolCall({
        name: request.params.name,
        arguments: request.params.arguments ?? {},
      });
      return server.projectCallToolResult(
        CallToolResultSchema.parse(result),
        undefined,
      );
    });

    server.setRequestHandler('resources/list', () => ({
      resources: authContext
        ? toolRegistry.getResources()
        : toolRegistry.getPublicResources(),
    }));

    server.setRequestHandler('resources/read', async (request) =>
      toolRegistry.handleResourceRead(request.params),
    );

    this.analyticsService.instrumentServer(server, authContext);

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
