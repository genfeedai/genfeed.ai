import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_SOCIAL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Initiate OAuth connect flow for a platform and return a connect action card.',
    name: 'initiate_oauth_connect',
    parameters: {
      properties: {
        platform: {
          description: 'Platform to connect',
          enum: [
            'twitter',
            'instagram',
            'youtube',
            'tiktok',
            'linkedin',
            'facebook',
            'fanvue',
          ],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      "Get the user's currently selected brand profile for the active organization.",
    name: 'get_current_brand',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Prompt the user to connect a social media account via OAuth. Sends a UI action card to the frontend with a connect button for the specified platform.',
    name: 'connect_social_account',
    parameters: {
      properties: {
        platform: {
          description: 'Social platform to connect',
          enum: [
            'twitter',
            'instagram',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
