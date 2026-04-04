import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import type { McpSession } from '@mcp/shared/interfaces/mcp-session.interface';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Request, Response } from 'express';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

@Injectable()
export class StreamableHttpService implements OnModuleDestroy {
  private sessions = new Map<string, McpSession>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    readonly _toolRegistry: ToolRegistryService,
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.cleanupInterval = setInterval(
      () => this.cleanupStaleSessions(),
      60 * 1000,
    );
  }

  async onModuleDestroy() {
    clearInterval(this.cleanupInterval);
    for (const [sessionId, session] of this.sessions) {
      try {
        await session.server.close();
      } catch {
        this.logger.error(`Error closing session ${sessionId}`);
      }
    }
    this.sessions.clear();
  }

  async handlePost(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      session.lastActivityAt = new Date();

      const authContext = (req as AuthenticatedRequest).authContext;
      if (authContext?.token) {
        session.clientService.setBearerToken(authContext.token);
      }

      await session.transport.handleRequest(req, res);
      return;
    }

    const session = await this.createSession(req);
    await session.transport.handleRequest(req, res);
  }

  async handleGet(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    const session = this.sessions.get(sessionId)!;
    session.lastActivityAt = new Date();

    await session.transport.handleRequest(req, res);
  }

  async handleDelete(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !this.sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await this.destroySession(sessionId);
    res.status(200).json({ status: 'session closed' });
  }

  private async createSession(req: Request): Promise<McpSession> {
    const authContext = (req as AuthenticatedRequest).authContext;

    const clientService = this.createClientService(authContext?.token);

    const toolRegistryForSession = new ToolRegistryService(
      clientService,
      this.logger,
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

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
      tools: toolRegistryForSession.getTools(),
    }));

    server.setRequestHandler(
      CallToolRequestSchema,
      async (request: { params: unknown }) =>
        toolRegistryForSession.handleToolCall(
          request.params as {
            name: string;
            arguments: Record<string, unknown>;
          },
        ),
    );

    server.setRequestHandler(ListResourcesRequestSchema, () => ({
      resources: toolRegistryForSession.getResources(),
    }));

    server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: { params: unknown }) =>
        toolRegistryForSession.handleResourceRead(
          request.params as { uri: string },
        ),
    );

    await server.connect(transport);

    const sessionId = transport.sessionId;
    if (!sessionId) {
      throw new Error('Transport did not generate a session ID');
    }

    const session: McpSession = {
      clientService,
      createdAt: new Date(),
      id: sessionId,
      lastActivityAt: new Date(),
      organizationId: authContext?.organizationId,
      server,
      transport,
      userId: authContext?.userId,
    };

    this.sessions.set(sessionId, session);

    transport.onclose = () => {
      this.sessions.delete(sessionId);
      this.logger.debug(`Session ${sessionId} closed via transport`);
    };

    this.logger.debug(
      `New Streamable HTTP session created: ${sessionId} (user: ${authContext?.userId || 'unknown'})`,
    );

    return session;
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

  private async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      await session.server.close();
    } catch (error: unknown) {
      this.logger.error(`Error closing session ${sessionId}:`, error);
    }

    this.sessions.delete(sessionId);
    this.logger.debug(`Session ${sessionId} destroyed`);
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivityAt.getTime() > SESSION_TIMEOUT_MS) {
        this.logger.debug(`Cleaning up stale session: ${sessionId}`);
        this.destroySession(sessionId).catch((err) =>
          this.logger.error(
            `Failed to cleanup stale session ${sessionId}`,
            err,
          ),
        );
      }
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

interface AuthenticatedRequest extends Request {
  authContext?: {
    token?: string;
    userId?: string;
    organizationId?: string;
  };
}
