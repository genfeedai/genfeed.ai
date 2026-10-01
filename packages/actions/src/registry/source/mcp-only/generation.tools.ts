import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const MCP_GENERATION_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'Check the status of a video creation job',
    name: 'get_video_status',
    parameters: {
      properties: {
        videoId: {
          description: 'The ID of the video to check',
          type: 'string',
        },
      },
      required: ['videoId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'List all videos in your organization',
    name: 'list_videos',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of videos to return',
          type: 'number',
        },
        offset: {
          default: 0,
          description: 'Offset for pagination',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'List all generated images',
    name: 'list_images',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of images to return',
          type: 'number',
        },
        offset: {
          default: 0,
          description: 'Offset for pagination',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'List all available avatars',
    name: 'list_avatars',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of avatars to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'List all generated music tracks',
    name: 'list_music',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of tracks to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
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
          format: 'uuid',
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
