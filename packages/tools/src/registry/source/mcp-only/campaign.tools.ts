import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_CAMPAIGN_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'List Google Ads campaigns with optional status filter',
    name: 'list_google_ads_campaigns',
    parameters: {
      properties: {
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        limit: {
          default: 50,
          description: 'Maximum number of campaigns',
          type: 'number',
        },
        loginCustomerId: {
          description:
            'Manager account customer ID (required when accessing client accounts via manager)',
          type: 'string',
        },
        status: {
          description: 'Filter by campaign status',
          enum: ['ENABLED', 'PAUSED', 'REMOVED'],
          type: 'string',
        },
      },
      required: ['customerId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get detailed metrics for a Google Ads campaign including impressions, clicks, cost, conversions, CTR, and CPC',
    name: 'get_google_ads_campaign_metrics',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
          type: 'string',
        },
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        endDate: {
          description: 'End date (YYYY-MM-DD)',
          type: 'string',
        },
        loginCustomerId: {
          description: 'Manager account customer ID',
          type: 'string',
        },
        segmentByDate: {
          default: false,
          description: 'Break down metrics by date',
          type: 'boolean',
        },
        startDate: {
          description: 'Start date (YYYY-MM-DD)',
          type: 'string',
        },
      },
      required: ['customerId', 'campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List Meta ad campaigns with optional status filter and pagination',
    name: 'list_meta_campaigns',
    parameters: {
      properties: {
        adAccountId: {
          description: 'The ad account ID (e.g., act_123456)',
          type: 'string',
        },
        limit: {
          default: 50,
          description: 'Maximum number of campaigns to return',
          type: 'number',
        },
        status: {
          description: 'Filter by campaign status',
          enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'],
          type: 'string',
        },
      },
      required: ['adAccountId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get detailed performance insights for a Meta ad campaign including spend, impressions, clicks, CTR, CPC, CPM, and conversions',
    name: 'get_meta_campaign_insights',
    parameters: {
      properties: {
        campaignId: {
          description: 'The campaign ID',
          type: 'string',
        },
        datePreset: {
          default: 'last_30d',
          description: 'Predefined date range',
          enum: [
            'today',
            'yesterday',
            'last_7d',
            'last_14d',
            'last_30d',
            'last_90d',
          ],
          type: 'string',
        },
        since: {
          description: 'Start date (YYYY-MM-DD) for custom range',
          type: 'string',
        },
        until: {
          description: 'End date (YYYY-MM-DD) for custom range',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Compare performance metrics side-by-side for multiple Meta campaigns',
    name: 'compare_meta_campaigns',
    parameters: {
      properties: {
        campaignIds: {
          description: 'Array of campaign IDs to compare',
          items: { type: 'string' },
          type: 'array',
        },
        datePreset: {
          default: 'last_30d',
          description: 'Predefined date range for comparison',
          enum: [
            'today',
            'yesterday',
            'last_7d',
            'last_14d',
            'last_30d',
            'last_90d',
          ],
          type: 'string',
        },
      },
      required: ['campaignIds'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
