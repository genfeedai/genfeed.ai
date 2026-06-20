import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_ANALYTICS_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Get analytics data for the user. Can specify a time range and metrics.',
    name: 'get_analytics',
    parameters: {
      properties: {
        contentId: {
          description:
            'Existing content or ingredient ID to resolve to the latest related published post analytics.',
          type: 'string',
        },
        ingredientId: {
          description:
            'Existing ingredient ID to resolve to the latest related published post analytics.',
          type: 'string',
        },
        metric: {
          description:
            'Specific metric to retrieve for organization summaries.',
          enum: ['engagement', 'reach', 'followers', 'impressions', 'clicks'],
          type: 'string',
        },
        period: {
          description: 'Time period for organization analytics summaries.',
          enum: ['7d', '30d', '90d'],
          type: 'string',
        },
        postId: {
          description: 'Existing post ID to fetch a direct analytics snapshot.',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Analyze recent content performance over the last 30 days. Returns engagement rates grouped by content type, platform, and posting time, plus top-performing posts.',
    name: 'analyze_performance',
    parameters: {
      properties: {
        days: {
          description: 'Number of days to analyze (default 30)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
];
