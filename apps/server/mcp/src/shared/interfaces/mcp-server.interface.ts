import type { McpRole } from '@mcp/services/auth.service';
import type { Server } from '@modelcontextprotocol/sdk/server';
import type { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export interface McpServerConfig {
  name: string;
  version: string;
  transport: StdioServerTransport;
  server: Server;
}

export interface McpToolInputSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}

/** @deprecated Prefer canonical tool metadata from @genfeedai/tools. */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  requiredRole: McpRole;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
