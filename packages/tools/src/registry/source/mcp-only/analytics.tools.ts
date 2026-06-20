import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_ANALYTICS_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'Get detailed analytics for a specific video',
    name: 'get_video_analytics',
    parameters: {
      properties: {
        timeRange: {
          default: '7d',
          description: 'Time range for analytics',
          enum: ['24h', '7d', '30d', '90d', 'all'],
          type: 'string',
        },
        videoId: {
          description: 'The ID of the video',
          type: 'string',
        },
      },
      required: ['videoId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get analytics for a specific piece of content (article, video, or image)',
    name: 'get_content_analytics',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content',
          type: 'string',
        },
        contentType: {
          description: 'Type of content',
          enum: ['article', 'video', 'image'],
          type: 'string',
        },
        timeRange: {
          default: '7d',
          description: 'Time range for analytics',
          enum: ['24h', '7d', '30d', '90d', 'all'],
          type: 'string',
        },
      },
      required: ['contentId', 'contentType'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get aggregated ad performance insights from the performing ads database across all connected customers',
    name: 'get_ad_performance_insights',
    parameters: {
      properties: {
        industry: {
          description: 'Filter by industry',
          type: 'string',
        },
        platform: {
          description: 'Filter by ad platform',
          enum: ['meta', 'google'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Compare your ad metrics against industry benchmarks from the performing ads database',
    name: 'benchmark_ad_performance',
    parameters: {
      properties: {
        industry: {
          description: 'Industry to benchmark against',
          type: 'string',
        },
        platform: {
          description: 'Ad platform to benchmark',
          enum: ['meta', 'google'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get keyword performance report with quality scores, clicks, impressions, and cost',
    name: 'get_google_ads_keyword_performance',
    parameters: {
      properties: {
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        endDate: {
          description: 'End date (YYYY-MM-DD)',
          type: 'string',
        },
        limit: {
          default: 100,
          description: 'Maximum number of keywords',
          type: 'number',
        },
        loginCustomerId: {
          description: 'Manager account customer ID',
          type: 'string',
        },
        startDate: {
          description: 'Start date (YYYY-MM-DD)',
          type: 'string',
        },
      },
      required: ['customerId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get analytics for LinkedIn posts including impressions, engagement rate, reactions, comments, and shares. Requires a content ID.',
    name: 'get_linkedin_analytics',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content to get LinkedIn analytics for',
          type: 'string',
        },
        timeRange: {
          default: '7d',
          description: 'Time range for analytics',
          enum: ['24h', '7d', '30d', '90d'],
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
