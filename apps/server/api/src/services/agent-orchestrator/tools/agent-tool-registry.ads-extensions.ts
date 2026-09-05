import type { AgentToolOutput } from '@genfeedai/actions';

/** Ads research and launch-review overrides for reviewed catalog actions. */
export const ADS_AGENT_TOOL_EXTENSIONS: AgentToolOutput[] = [
  {
    creditCost: 0,
    description:
      'List the highest-performing public and connected ads for the current brand niche, platform, source, metric, and timeframe filters.',
    name: 'list_ads_research',
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Optional connected ad account ID for my-account lookups.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        channel: {
          description:
            'Optional Google inventory filter. Meta always uses all placements.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Optional connected credential ID for my-account lookups.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        limit: {
          description: 'Optional maximum number of ads to inspect.',
          type: 'number',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        metric: {
          description: 'Optional ranking metric.',
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
          description: 'Optional ads platform filter.',
          enum: ['meta', 'google', 'tiktok', 'x'],
          type: 'string',
        },
        source: {
          description:
            'Whether to search public niche winners, connected accounts, or both.',
          enum: ['public', 'my_accounts', 'all'],
          type: 'string',
        },
        timeframe: {
          description: 'Optional timeframe filter.',
          enum: ['last_7_days', 'last_30_days', 'last_90_days', 'all_time'],
          type: 'string',
        },
      },
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Inspect one ad from the ads research hub and return the creative, metrics, and pattern explanation.',
    name: 'get_ad_research_detail',
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when inspecting a my-account ad.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by list_ads_research.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Connected credential ID when inspecting a my-account ad.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google', 'tiktok', 'x'],
          type: 'string',
        },
        source: {
          description: 'Where the ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create an official ad remix workflow from a selected ad. The workflow stays in review and does not auto-publish.',
    name: 'create_ad_remix_workflow',
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when the source ad comes from my accounts.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by ads research.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Connected credential ID when the source ad comes from my accounts.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        objective: {
          description:
            'Optional campaign objective override such as Conversions or Leads.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google', 'tiktok', 'x'],
          type: 'string',
        },
        source: {
          description: 'Where the source ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Generate a brand-specific ad pack from a selected ad without creating a launch or publish action.',
    name: 'generate_ad_pack',
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when the source ad comes from my accounts.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by ads research.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Connected credential ID when the source ad comes from my accounts.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        objective: {
          description:
            'Optional campaign objective override such as Conversions or Leads.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google', 'tiktok', 'x'],
          type: 'string',
        },
        source: {
          description: 'Where the source ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Prepare a paused Meta, Google, or X campaign launch draft for review from a selected ad. This never publishes live.',
    name: 'prepare_ad_launch_review',
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when the source ad comes from my accounts.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by ads research.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        campaignName: {
          description: 'Optional campaign name override.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        createWorkflow: {
          description:
            'Whether to also create a reusable remix workflow as part of launch prep.',
          type: 'boolean',
        },
        credentialId: {
          description:
            'Connected credential ID when the source ad comes from my accounts.',
          type: 'string',
        },
        dailyBudget: {
          description:
            'Optional paused daily budget for the prepared campaign.',
          type: 'number',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        objective: {
          description:
            'Optional campaign objective override such as Conversions or Leads.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google', 'tiktok', 'x'],
          type: 'string',
        },
        source: {
          description: 'Where the source ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
];
