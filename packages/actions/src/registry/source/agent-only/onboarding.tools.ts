import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_ONBOARDING_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Propose a starter brand identity from conversational onboarding details. Creation requires confirmation through the returned in-product action card.',
    name: 'create_brand',
    parameters: {
      properties: {
        description: {
          description: 'Brand description or positioning statement',
          type: 'string',
        },
        handle: {
          description: 'Legacy alias for the proposed brand slug',
          type: 'string',
        },
        label: {
          description: 'Proposed brand display name',
          type: 'string',
        },
        name: {
          description: 'Legacy alias for the proposed brand display name',
          type: 'string',
        },
        niche: {
          description: 'Primary niche for content',
          type: 'string',
        },
        slug: {
          description: 'Proposed URL-safe brand slug',
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
      'Propose a new label and slug for the active thread brand. Renaming requires confirmation through the returned in-product action card.',
    name: 'rename_brand',
    parameters: {
      properties: {
        description: {
          description: 'Optional updated brand description',
          type: 'string',
        },
        label: {
          description: 'Proposed new brand display name',
          type: 'string',
        },
        slug: {
          description: 'Proposed new URL-safe brand slug',
          type: 'string',
        },
      },
      required: ['label'],
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
