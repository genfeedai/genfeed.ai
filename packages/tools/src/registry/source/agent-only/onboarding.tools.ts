import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_ONBOARDING_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Create a starter brand from conversational onboarding details (name, handle, niche, voice).',
    name: 'create_brand',
    parameters: {
      properties: {
        description: {
          description: 'Brand description or positioning statement',
          type: 'string',
        },
        handle: {
          description: 'Brand handle, with or without @ prefix',
          type: 'string',
        },
        name: {
          description: 'Brand display name',
          type: 'string',
        },
        niche: {
          description: 'Primary niche for content',
          type: 'string',
        },
        voice: {
          description: 'Preferred brand voice, e.g. casual, edgy, premium',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Check onboarding setup status and return what is complete vs still missing (brand, credentials, first content).',
    name: 'check_onboarding_status',
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
      'Mark onboarding as completed and sync claims/metadata for the current user and organization.',
    name: 'complete_onboarding',
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
      'Generate sample content during onboarding — 3 tweets + 3 images using cheap models. Credits are deducted from free signup balance. Returns preview URLs and text.',
    name: 'generate_onboarding_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
      },
      required: ['brandId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
