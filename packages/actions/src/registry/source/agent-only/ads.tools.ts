import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

/**
 * Shared source-ad selectors for agent-only ad remix actions. Ads research
 * itself is an overlap action; these two are agent-only because they produce
 * in-app review state rather than a portable MCP result.
 */
const AD_REMIX_PROPERTIES = {
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
    enum: ['meta', 'google'],
    type: 'string',
  },
  source: {
    description: 'Where the source ad came from.',
    enum: ['public', 'my_accounts'],
    type: 'string',
  },
} as const;

export const AGENT_ADS_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Generate a brand-specific ad pack from a selected ad without creating a launch or publish action.',
    name: 'generate_ad_pack',
    parameters: {
      properties: AD_REMIX_PROPERTIES,
      required: ['adId', 'source'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Prepare a paused Meta or Google campaign launch draft for review from a selected ad. This never publishes live.',
    name: 'prepare_ad_launch_review',
    parameters: {
      properties: {
        ...AD_REMIX_PROPERTIES,
        campaignName: {
          description: 'Optional campaign name override.',
          type: 'string',
        },
        createWorkflow: {
          description:
            'Whether to also create a reusable remix workflow as part of launch prep.',
          type: 'boolean',
        },
        dailyBudget: {
          description:
            'Optional paused daily budget for the prepared campaign.',
          type: 'number',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
