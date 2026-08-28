import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_CAMPAIGN_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Create a campaign from conversation inputs (label, credentialId, platform, type, and optional settings). Only verified X public-reply, X DM, and X Scheduled Blast pairs are executable.',
    name: 'create_campaign',
    parameters: {
      properties: {
        campaignType: {
          description:
            'Campaign type. Only verified X public-reply, X DM, and X Scheduled Blast types are executable.',
          enum: ['manual', 'discovery', 'dm_outreach', 'scheduled'],
          type: 'string',
        },
        credentialId: {
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
          description:
            'Campaign platform. Only verified X public-reply, X DM, and X Scheduled Blast pairs are executable.',
          enum: ['twitter'],
          type: 'string',
        },
      },
      required: ['label', 'credentialId', 'platform', 'campaignType'],
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
