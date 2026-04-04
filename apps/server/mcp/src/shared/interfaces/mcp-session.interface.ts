import type { ClientService } from '@mcp/services/client.service';
import type { Server } from '@modelcontextprotocol/sdk/server';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface McpSession {
  id: string;
  transport: StreamableHTTPServerTransport;
  server: Server;
  clientService: ClientService;
  createdAt: Date;
  lastActivityAt: Date;
  userId?: string;
  organizationId?: string;
}
