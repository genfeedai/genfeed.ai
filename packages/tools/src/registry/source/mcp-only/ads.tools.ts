import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_ADS_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'List accessible Google Ads customer accounts',
    name: 'list_google_ads_customers',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Get performance insights for a Google Ads ad group',
    name: 'get_google_ads_adgroup_insights',
    parameters: {
      properties: {
        adGroupId: {
          description: 'Ad group ID',
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
        startDate: {
          description: 'Start date (YYYY-MM-DD)',
          type: 'string',
        },
      },
      required: ['customerId', 'adGroupId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get search terms report showing actual search queries that triggered your ads',
    name: 'get_google_ads_search_terms',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID to get search terms for',
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
        limit: {
          default: 100,
          description: 'Maximum number of search terms',
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
      required: ['customerId', 'campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Get performance insights for a Meta ad set',
    name: 'get_meta_adset_insights',
    parameters: {
      properties: {
        adSetId: {
          description: 'The ad set ID',
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
      },
      required: ['adSetId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get performance insights for an individual Meta ad including creative details',
    name: 'get_meta_ad_insights',
    parameters: {
      properties: {
        adId: {
          description: 'The ad ID',
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
      },
      required: ['adId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List creative assets (headlines, body text, CTAs, images) for Meta ads',
    name: 'list_meta_ad_creatives',
    parameters: {
      properties: {
        adAccountId: {
          description: 'The ad account ID',
          type: 'string',
        },
        limit: {
          default: 50,
          description: 'Maximum number of creatives to return',
          type: 'number',
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
      'Get top performing Meta ads sorted by a specific metric (CTR, ROAS, CPC, etc.)',
    name: 'get_meta_top_performers',
    parameters: {
      properties: {
        adAccountId: {
          description: 'The ad account ID',
          type: 'string',
        },
        limit: {
          default: 10,
          description: 'Number of top performers to return',
          type: 'number',
        },
        metric: {
          description: 'Metric to rank by',
          enum: [
            'ctr',
            'cpc',
            'cpm',
            'spend',
            'impressions',
            'clicks',
            'conversions',
            'reach',
          ],
          type: 'string',
        },
      },
      required: ['adAccountId', 'metric'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'List TikTok advertiser accounts for a connected credential',
    name: 'list_tiktok_ad_accounts',
    parameters: {
      properties: {
        credentialId: {
          description: 'ID of the connected TikTok Ads credential',
          type: 'string',
        },
      },
      required: ['credentialId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'List TikTok ad groups within a campaign',
    name: 'list_tiktok_adgroups',
    parameters: {
      properties: {
        adAccountId: {
          description: 'TikTok advertiser account ID',
          type: 'string',
        },
        campaignId: {
          description: 'Campaign ID to list ad groups for',
          type: 'string',
        },
        credentialId: {
          description: 'ID of the connected TikTok Ads credential',
          type: 'string',
        },
      },
      required: ['credentialId', 'adAccountId', 'campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List TikTok ads, optionally narrowed to a single ad group. Returns creative details alongside each ad',
    name: 'list_tiktok_ads',
    parameters: {
      properties: {
        adAccountId: {
          description: 'TikTok advertiser account ID',
          type: 'string',
        },
        adGroupId: {
          description: 'Optional ad group ID to filter by',
          type: 'string',
        },
        credentialId: {
          description: 'ID of the connected TikTok Ads credential',
          type: 'string',
        },
      },
      required: ['credentialId', 'adAccountId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get top performing TikTok ads sorted by a specific metric (CTR, CPC, spend, etc.)',
    name: 'get_tiktok_top_performers',
    parameters: {
      properties: {
        adAccountId: {
          description: 'TikTok advertiser account ID',
          type: 'string',
        },
        credentialId: {
          description: 'ID of the connected TikTok Ads credential',
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
        limit: {
          default: 10,
          description: 'Number of top performers to return',
          type: 'number',
        },
        metric: {
          default: 'ctr',
          description: 'Metric to rank by',
          enum: [
            'ctr',
            'cpc',
            'cpm',
            'spend',
            'impressions',
            'clicks',
            'conversions',
          ],
          type: 'string',
        },
      },
      required: ['credentialId', 'adAccountId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
