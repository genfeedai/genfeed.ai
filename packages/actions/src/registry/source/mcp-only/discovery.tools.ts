import type { SourceTool } from '../../../interfaces/source-tool.interface';

/**
 * MCP discovery meta tool. Every connection lists every tool, so this finds
 * a tool or action by what it does and describes one tool's input. Schemas and
 * handling live on the MCP server (`apps/server/mcp`); this shard only declares
 * the curated catalog contract the tool must satisfy.
 */
export const MCP_DISCOVERY_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Find tools callable on this connection, filtered by its endpoint permissions and caller role. No arguments: list every tool. query: search by tool name, description or the name of an action it runs. name: describe one tool, or a retired tool name, with its input schema, mutation policy, credit cost and required role.',
    mcpDescription:
      'Discover permitted tools. No args: list all. query: search tool and action names and descriptions. name: schema, policy, cost and role.',
    name: 'find_tools',
    parameters: {
      properties: {
        name: {
          description:
            'Exact tool name to describe. Takes precedence over query.',
          type: 'string',
        },
        query: {
          description:
            'Case-insensitive substring to match against tool name, description or action name.',
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
