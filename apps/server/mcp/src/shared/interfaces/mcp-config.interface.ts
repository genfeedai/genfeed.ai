import type { ToolCategory } from '@genfeedai/actions';
import type { McpResource } from '@mcp/shared/interfaces/mcp-resource.interface';

export interface McpConfiguration {
  mcpServers: {
    [key: string]:
      | {
          args: string[];
          command: string;
          env?: Record<string, string>;
        }
      | {
          headers?: Record<string, string>;
          transport?: string;
          type: 'http';
          url: string;
        };
  };
}

export interface McpExampleToolPreview {
  category: ToolCategory;
  description: string;
  name: string;
}

/**
 * How the public example describes the tool surface. It never inlines the whole
 * catalog: the authoritative list is role-filtered and lives behind the
 * authenticated `endpoint`, so an unauthenticated reader gets an accurate count
 * plus a small `user`-role sample instead of a hand-maintained fiction.
 */
export interface McpExampleTools {
  endpoint: string;
  preview: McpExampleToolPreview[];
  total: number;
}

export interface McpExample {
  capabilities: {
    resources: { listChanged: boolean };
    tools: { listChanged: boolean };
  };
  description: string;
  installation: {
    clientExamples: McpClientExamples;
    description: string;
    steps: string[];
  };
  name: string;
  resources: McpResource[];
  tools: McpExampleTools;
  version: string;
}

export interface McpClientExamples {
  claudeCode: {
    command: string;
  };
  codex: {
    command: string;
    configToml: string;
  };
  mcpServers: {
    [key: string]: {
      env?: Record<string, string>;
      headers?: Record<string, string>;
      transport?: string;
      type: 'http';
      url: string;
    };
  };
}
