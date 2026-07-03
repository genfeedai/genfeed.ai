import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_OPERATOR_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'List the live Genfeed.ai tool catalog available to agent, MCP, and CLI surfaces. Use when the user asks what tools exist, what MCP can do, or which capabilities are available.',
    name: 'list_genfeed_tools',
    parameters: {
      properties: {
        category: {
          description:
            'Optional category filter such as generation, content, workflow, analytics, campaign, social, admin, ads, agent-control, or other.',
          type: 'string',
        },
        includeParameters: {
          description:
            'Whether to include each tool parameter schema. Defaults to false to keep responses compact.',
          type: 'boolean',
        },
        limit: {
          description:
            'Maximum number of tool rows to return after filtering. Defaults to 80.',
          type: 'number',
        },
        query: {
          description:
            'Optional case-insensitive search across tool name and description.',
          type: 'string',
        },
        role: {
          description:
            'Maximum required role to include. Defaults to user. Admin includes user+admin; superadmin includes every tool.',
          enum: ['user', 'admin', 'superadmin'],
          type: 'string',
        },
        surface: {
          description:
            'Tool surface to inspect. Use all for a combined catalog.',
          enum: ['agent', 'mcp', 'cli', 'all'],
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
];
