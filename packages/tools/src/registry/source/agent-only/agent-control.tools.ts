import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_AGENT_CONTROL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Request an asset from another agent in the same campaign. Creates a sub-run for the target agent with the given specifications. The target agent will generate the asset and deliver it back.',
    name: 'request_asset',
    parameters: {
      properties: {
        assetType: {
          description: 'Type of asset to request',
          enum: ['image', 'video', 'text', 'audio'],
          type: 'string',
        },
        prompt: {
          description: 'Detailed prompt describing the desired asset',
          type: 'string',
        },
        specifications: {
          description:
            'Additional specifications (aspect ratio, duration, style, etc.)',
          type: 'object',
        },
        targetAgentId: {
          description: 'Strategy ID of the agent to request the asset from',
          type: 'string',
        },
      },
      required: ['targetAgentId', 'assetType', 'prompt'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
];
