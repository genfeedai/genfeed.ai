import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_WORKFLOW_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Resolve the best official workflow source for the request, ask for confirmation, then install it into the current organization. Prefer seeded templates first, official marketplace workflows second, and only generate a new workflow as fallback.',
    name: 'install_official_workflow',
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional brand ID to attach to the installed workflow after bootstrap.',
          type: 'string',
        },
        confirmed: {
          description:
            'Set to true only after the user confirms installation or generation.',
          type: 'boolean',
        },
        contentType: {
          description:
            'Optional content type hint for resolving the right workflow.',
          enum: ['image', 'video', 'post', 'newsletter'],
          type: 'string',
        },
        label: {
          description: 'Optional workflow label for the installed copy.',
          type: 'string',
        },
        platform: {
          description:
            'Optional platform hint such as linkedin, instagram, or tiktok.',
          type: 'string',
        },
        prompt: {
          description:
            'What the workflow should accomplish so the resolver can match the best official source.',
          type: 'string',
        },
        schedule: {
          description:
            'Optional cron expression to apply to the installed workflow.',
          type: 'string',
        },
        sourceDescription: {
          description:
            'Resolved source description from a prior confirmation step.',
          type: 'string',
        },
        sourceId: {
          description: 'Resolved source ID from a prior confirmation step.',
          type: 'string',
        },
        sourceName: {
          description: 'Resolved source name from a prior confirmation step.',
          type: 'string',
        },
        sourceSlug: {
          description:
            'Resolved marketplace slug from a prior confirmation step.',
          type: 'string',
        },
        sourceType: {
          description: 'Resolved source type from a prior confirmation step.',
          enum: ['seeded-template', 'marketplace-listing', 'generated'],
          type: 'string',
        },
        timezone: {
          description: 'Optional timezone for the workflow schedule.',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
