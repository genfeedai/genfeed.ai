import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_CAMPAIGN_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Create a campaign from conversation inputs (label, credential, platform, type, and optional settings).',
    name: 'create_campaign',
    parameters: {
      properties: {
        campaignType: {
          description: 'Campaign type',
          enum: ['manual', 'discovery', 'scheduled', 'dm_outreach'],
          type: 'string',
        },
        credential: {
          description: 'Credential ID to run campaign',
          type: 'string',
        },
        description: {
          description: 'Campaign description',
          type: 'string',
        },
        label: {
          description: 'Campaign label',
          type: 'string',
        },
        platform: {
          description: 'Campaign platform',
          enum: ['twitter', 'instagram', 'reddit'],
          type: 'string',
        },
      },
      required: ['label', 'credential', 'platform', 'campaignType'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Start an existing campaign by ID.',
    name: 'start_campaign',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
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
    description: 'Pause an existing campaign by ID.',
    name: 'pause_campaign',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
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
    description: 'Mark an existing campaign as completed by ID.',
    name: 'complete_campaign',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
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
    description: 'Get analytics summary for a campaign ID.',
    name: 'get_campaign_analytics',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
