import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_CAMPAIGN_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Create an outreach sequence from conversation inputs (label, credentialId, platform, type, and optional settings). Only verified X public-reply, X DM, and X Scheduled Blast pairs are executable.',
    name: 'create_outreach_sequence',
    parameters: {
      properties: {
        campaignType: {
          description:
            'Outreach sequence type. Only verified X public-reply, X DM, and X Scheduled Blast types are executable.',
          enum: ['manual', 'discovery', 'dm_outreach', 'scheduled'],
          type: 'string',
        },
        credentialId: {
          description: 'Credential ID to run the outreach sequence',
          type: 'string',
        },
        description: {
          description: 'Outreach sequence description',
          type: 'string',
        },
        label: {
          description: 'Outreach sequence label',
          type: 'string',
        },
        platform: {
          description:
            'Outreach sequence platform. Only verified X public-reply, X DM, and X Scheduled Blast pairs are executable.',
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
    description: 'Start an existing outreach sequence by ID.',
    name: 'start_outreach_sequence',
    parameters: {
      properties: {
        campaignId: {
          description: 'Outreach sequence ID',
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
    description: 'Pause an existing outreach sequence by ID.',
    name: 'pause_outreach_sequence',
    parameters: {
      properties: {
        campaignId: {
          description: 'Outreach sequence ID',
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
    description: 'Mark an existing outreach sequence as completed by ID.',
    name: 'complete_outreach_sequence',
    parameters: {
      properties: {
        campaignId: {
          description: 'Outreach sequence ID',
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
    description: 'Get analytics summary for an outreach sequence ID.',
    name: 'get_outreach_sequence_analytics',
    parameters: {
      properties: {
        campaignId: {
          description: 'Outreach sequence ID',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
