import type { SourceTool } from '../../interfaces/source-tool.interface.js';

const ADS_DETAIL_PROPERTIES = {
  adAccountId: {
    description: 'Connected ad account ID for a my-account ad.',
    type: 'string',
  },
  adId: {
    description: 'Ad identifier returned by list_ads_research.',
    type: 'string',
  },
  channel: {
    description: 'Optional Google inventory filter.',
    enum: ['all', 'search', 'display', 'youtube'],
    type: 'string',
  },
  credentialId: {
    description: 'Connected credential ID for a my-account ad.',
    type: 'string',
  },
  loginCustomerId: {
    description: 'Optional Google manager login customer ID.',
    type: 'string',
  },
  platform: {
    description: 'Optional platform hint for connected ads.',
    enum: ['meta', 'google'],
    type: 'string',
  },
  source: {
    description:
      'Whether the ad is public research or from a connected account.',
    enum: ['public', 'my_accounts'],
    type: 'string',
  },
} as const;

export const OVERLAP_INSPIRATION_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Create a draft, review-only ad remix workflow from a selected public or connected ad. This never launches an ad.',
    name: 'create_ad_remix_workflow',
    parameters: {
      properties: {
        ...ADS_DETAIL_PROPERTIES,
        brandId: {
          description:
            'Optional organization-owned brand ID. Otherwise the selected brand is used.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        objective: {
          description: 'Optional campaign objective override.',
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Create a draft, review-only Instagram remix workflow that adapts a public post pattern to the selected brand. This is prompt-based reinterpretation, not video style transfer.',
    name: 'create_instagram_remix_workflow',
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional organization-owned brand ID. Otherwise the selected brand is used.',
          type: 'string',
        },
        mode: {
          default: 'inspired_by',
          description:
            'How closely to reinterpret the source creative pattern.',
          enum: ['inspired_by', 'match_closely', 'remix_concept'],
          type: 'string',
        },
        notes: {
          description: 'Optional original creative direction for the remix.',
          maxLength: 1000,
          type: 'string',
        },
        shortcode: {
          description: 'Instagram post or Reel shortcode.',
          type: 'string',
        },
        username: {
          description: 'Public Instagram username that owns the source post.',
          type: 'string',
        },
      },
      required: ['username', 'shortcode'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Inspect one ad from ads research and return its creative, metrics, and reusable pattern explanation.',
    name: 'get_ad_research_detail',
    parameters: {
      properties: ADS_DETAIL_PROPERTIES,
      required: ['adId', 'source'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Fetch latest or top public posts from one Instagram account and return provenance plus abstract hook, format, pacing, and style signals.',
    name: 'get_instagram_inspiration_detail',
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional organization-owned brand ID. Otherwise the selected brand is used.',
          type: 'string',
        },
        limit: {
          default: 12,
          description: 'Maximum posts to inspect.',
          maximum: 24,
          minimum: 1,
          type: 'number',
        },
        mediaType: {
          default: 'reels',
          description: 'Content type to return.',
          enum: ['all', 'posts', 'reels'],
          type: 'string',
        },
        sort: {
          default: 'latest',
          description: 'Order posts by recency or engagement.',
          enum: ['latest', 'top'],
          type: 'string',
        },
        username: {
          description: 'Public Instagram username to inspect.',
          type: 'string',
        },
      },
      required: ['username'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List the highest-performing public and connected ads for the selected brand niche, platform, source, metric, and timeframe.',
    name: 'list_ads_research',
    parameters: {
      properties: {
        adAccountId: {
          description: 'Optional connected ad account ID.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional organization-owned brand ID. Otherwise the selected brand is used.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description: 'Optional connected credential ID.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        limit: {
          description: 'Maximum ads to return.',
          maximum: 100,
          minimum: 1,
          type: 'number',
        },
        loginCustomerId: {
          description: 'Optional Google manager login customer ID.',
          type: 'string',
        },
        metric: {
          description: 'Ranking metric.',
          enum: [
            'performanceScore',
            'ctr',
            'roas',
            'conversions',
            'spendEfficiency',
          ],
          type: 'string',
        },
        platform: {
          description: 'Ads platform filter.',
          enum: ['meta', 'google'],
          type: 'string',
        },
        source: {
          description: 'Search public research, connected accounts, or both.',
          enum: ['public', 'my_accounts', 'all'],
          type: 'string',
        },
        timeframe: {
          description: 'Performance timeframe.',
          enum: ['last_7_days', 'last_30_days', 'last_90_days', 'all_time'],
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
      'Discover public Instagram accounts and content patterns relevant to the selected brand niche.',
    name: 'list_instagram_inspiration',
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional organization-owned brand ID. Otherwise the selected brand is used.',
          type: 'string',
        },
        hashtags: {
          description: 'Optional explicit Instagram discovery hashtags.',
          items: { type: 'string' },
          maxItems: 5,
          type: 'array',
        },
        limit: {
          default: 8,
          description: 'Maximum peer accounts to return.',
          maximum: 15,
          minimum: 1,
          type: 'number',
        },
        mediaType: {
          default: 'reels',
          description: 'Content type to sample.',
          enum: ['all', 'posts', 'reels'],
          type: 'string',
        },
        niche: {
          description:
            'Optional niche override used to derive discovery seeds.',
          maxLength: 200,
          type: 'string',
        },
        sort: {
          default: 'top',
          description: 'Order sampled posts by engagement or recency.',
          enum: ['latest', 'top'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
];
