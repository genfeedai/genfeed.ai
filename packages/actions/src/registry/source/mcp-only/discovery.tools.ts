import type { SourceTool } from '../../../interfaces/source-tool.interface';

/**
 * MCP discovery meta tools.
 *
 * These let a client that only connected with a subset of toolsets (via
 * `?toolsets=`) still find and inspect tools it did not list — they are the
 * reason the always-on `core` toolset exists. Schemas and handling live on
 * the MCP server (`apps/server/mcp`); this shard only declares the curated
 * catalog contract these tools must satisfy.
 */
export const MCP_DISCOVERY_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Find tools this server offers, including ones outside the current ?toolsets= selection. No arguments: list toolsets with descriptions and tool counts. query and/or toolset: search tools by name, description, or toolset. name: describe one tool with its full input schema, toolset, mutation policy, credit cost, and required role.',
    name: 'find_tools',
    parameters: {
      properties: {
        name: {
          description:
            'Exact tool name to describe. Takes precedence over query and toolset.',
          type: 'string',
        },
        query: {
          description:
            'Case-insensitive substring to match against tool name, description, or toolset.',
          type: 'string',
        },
        toolset: {
          description: 'Restrict a search to one toolset.',
          type: 'string',
        },
        limit: {
          default: 20,
          description: 'Maximum number of search results (1-50).',
          maximum: 50,
          minimum: 1,
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
];
