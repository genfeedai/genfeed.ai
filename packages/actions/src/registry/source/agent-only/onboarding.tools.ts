import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_ONBOARDING_TOOLS: SourceTool[] = [
  {
    name: 'complete_brand_onboarding_step',
    creditCost: 0,
    requiredRole: 'user',
    description:
      'Complete the Expert brand conversation and hand off to positioning. Does not complete overall onboarding.',
    parameters: { type: 'object', required: [], properties: {} },
  },
  {
    name: 'scan_brand_url',
    creditCost: 0,
    requiredRole: 'user',
    description:
      'Scan one public website, social profile, link page or product URL and prefill the current brand. Returns scanned identity details or an honest failure reason.',
    parameters: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 2048 },
        brandId: { type: 'string', minLength: 1, maxLength: 200 },
      },
    },
  },
  {
    name: 'save_onboarding_answers',
    creditCost: 0,
    requiredRole: 'user',
    description:
      'Save onboarding card answers to the current brand strategy and voice right after each card, preserving other settings. Records skipped cards in skippedFields. Grants +5 credits once per answered card; returns the updated brand context score.',
    parameters: {
      type: 'object',
      required: [],
      properties: {
        brandId: { type: 'string', minLength: 1, maxLength: 200 },
        goals: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
        audience: {
          type: 'array',
          maxItems: 2,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
        offer: { type: 'string', minLength: 1, maxLength: 200 },
        competitors: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
        skippedFields: {
          type: 'array',
          maxItems: 7,
          items: {
            type: 'string',
            enum: [
              'goals',
              'audience',
              'offer',
              'competitors',
              'platforms',
              'tone',
              'cadence',
            ],
          },
        },
        platforms: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', minLength: 1, maxLength: 200 },
        },
        cadence: { type: 'string', minLength: 1, maxLength: 200 },
        toneAdjustment: { type: 'string', minLength: 1, maxLength: 200 },
      },
    },
  },
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
      'Generate one brand-specific tweet and one cost-priority image for review during onboarding. No social connection is needed. Returns actual preview URLs and text; ask for approval before offering account connection.',
    name: 'generate_onboarding_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID; omit to use the current conversation brand',
          type: 'string',
        },
        direction: {
          description:
            'Optional creative direction or requested changes to the draft, grounded in the saved brand.',
          type: 'string',
          maxLength: 2000,
        },
        retryTweet: {
          description:
            'Retry only the image for this exact previously generated tweet; reuse the text without another text generation.',
          type: 'string',
          maxLength: 280,
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
