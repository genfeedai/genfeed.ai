import { LoggerService } from '@libs/logger/logger.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class ServerService implements OnModuleInit, OnModuleDestroy {
  private server!: Server;
  private transport!: StdioServerTransport;
  private isRunning = false;

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    await this.initializeServer();
  }

  async onModuleDestroy() {
    await this.stopServer();
  }

  private async initializeServer() {
    try {
      this.transport = new StdioServerTransport();

      this.server = new Server(
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

      this.setupHandlers();

      await this.server.connect(this.transport);
      this.isRunning = true;

      this.logger.log('MCP Server initialized and running');
    } catch (error: unknown) {
      this.logger.error('Failed to initialize MCP server', error);
      throw error;
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.toolRegistry.getTools(),
    }));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: { params: unknown }) =>
        this.toolRegistry.handleToolCall(
          request.params as {
            name: string;
            arguments: Record<string, unknown>;
          },
        ),
    );

    this.server.setRequestHandler(ListResourcesRequestSchema, () => ({
      resources: this.toolRegistry.getResources(),
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: { params: unknown }) =>
        this.toolRegistry.handleResourceRead(request.params as { uri: string }),
    );
  }

  setBearerToken(token: string) {
    this.toolRegistry.setBearerToken(token);
  }

  async stopServer() {
    if (this.isRunning && this.server) {
      try {
        await this.server.close();
        this.isRunning = false;
        this.logger.log('MCP Server stopped');
      } catch (error: unknown) {
        this.logger.error('Error stopping MCP server:', error);
      }
    }
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }
}
