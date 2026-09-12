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
      'List the toolsets available on this server, each with its description and tool count. Use this to see what a narrower ?toolsets= connection is missing.',
    name: 'list_toolsets',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Search for tools by name/description substring and/or toolset. Provide at least one of query or toolset. Returns a summary per match — use describe_tool for the full schema of a specific tool.',
    name: 'search_tools',
    parameters: {
      properties: {
        limit: {
          default: 20,
          description: 'Maximum number of results to return (1-50)',
          maximum: 50,
          minimum: 1,
          type: 'number',
        },
        query: {
          description:
            'Case-insensitive substring to match against tool name, description, or toolset',
          type: 'string',
        },
        toolset: {
          description: 'Restrict results to a single toolset name',
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Describe one tool by exact name, returning its full input schema, toolset, mutation policy, credit cost, and required role. Useful for a tool that was filtered out of tools/list by the connection toolsets.',
    name: 'describe_tool',
    parameters: {
      properties: {
        name: {
          description: 'Exact tool name to describe',
          type: 'string',
        },
      },
      required: ['name'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
