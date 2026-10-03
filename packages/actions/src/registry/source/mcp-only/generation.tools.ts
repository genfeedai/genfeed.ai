import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const MCP_GENERATION_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Create a storyboard run from an owned Library video. Does not generate, quote, or charge credits.',
    name: 'create_storyboard_remix',
    parameters: {
      additionalProperties: false,
      properties: {
        assetId: {
          description: 'Owned Library video ingredient id',
          maxLength: 255,
          minLength: 1,
          pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
          type: 'string',
        },
        brandId: {
          maxLength: 255,
          minLength: 1,
          pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
          type: 'string',
        },
        clientRequestId: {
          description: 'Idempotency key for this storyboard run',
          maxLength: 36,
          minLength: 36,
          pattern:
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
          type: 'string',
        },
      },
      required: ['brandId', 'assetId', 'clientRequestId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Replace the character in one storyboard shot using Higgsfield Genjutsu motion transfer. Does not preserve source audio, does not guarantee lip-sync, and does not charge credits while the catalog row is inactive at cost 0.',
    name: 'replace_storyboard_character',
    parameters: {
      additionalProperties: false,
      properties: {
        brandId: {
          maxLength: 255,
          minLength: 1,
          pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
          type: 'string',
        },
        imageAssetIds: {
          description: 'One to eight owned Library character image ids',
          items: {
            maxLength: 255,
            minLength: 1,
            pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
            type: 'string',
          },
          maxItems: 8,
          minItems: 1,
          type: 'array',
        },
        prompt: {
          maxLength: 1000,
          type: 'string',
        },
        runId: {
          maxLength: 255,
          minLength: 1,
          pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
          type: 'string',
        },
        shotId: {
          maxLength: 255,
          minLength: 1,
          pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
          type: 'string',
        },
      },
      required: ['brandId', 'runId', 'shotId', 'imageAssetIds'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
