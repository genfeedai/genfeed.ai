import type { McpRole } from '@mcp/services/auth.service';

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
