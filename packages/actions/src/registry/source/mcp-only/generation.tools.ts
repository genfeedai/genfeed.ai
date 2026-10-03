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
        origin: {
          description:
            'Only videos with this permanent origin: UPLOADED (a member added the file), GENERATED (Genfeed produced it), IMPORTED (saved from an external post or page) or UNKNOWN (legacy)',
          enum: ['UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN'],
          type: 'string',
        },
        characterIds: {
          description:
            'Only videos generated with any of these characters (character ids). Only characters available to the active brand are honoured; an unavailable id matches nothing',
          items: { type: 'string' },
          maxItems: 25,
          type: 'array',
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
        origin: {
          description:
            'Only images with this permanent origin: UPLOADED (a member added the file), GENERATED (Genfeed produced it), IMPORTED (saved from an external post or page) or UNKNOWN (legacy)',
          enum: ['UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN'],
          type: 'string',
        },
        characterIds: {
          description:
            'Only images generated with any of these characters (character ids). Only characters available to the active brand are honoured; an unavailable id matches nothing',
          items: { type: 'string' },
          maxItems: 25,
          type: 'array',
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
        origin: {
          description:
            'Only avatars with this permanent origin: UPLOADED (a member added the file), GENERATED (Genfeed produced it), IMPORTED (saved from an external post or page) or UNKNOWN (legacy)',
          enum: ['UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN'],
          type: 'string',
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
        origin: {
          description:
            'Only tracks with this permanent origin: UPLOADED (a member added the file), GENERATED (Genfeed produced it), IMPORTED (saved from an external post or page) or UNKNOWN (legacy)',
          enum: ['UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN'],
          type: 'string',
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
      'Merge two or more existing videos into one clip. Supports transitions, captions, resizing, mute, and background music. Slideshow zoom (zoomEaseCurve and zoomConfigs) is not supported: sending either field is rejected and no merge is started.',
    name: 'merge_videos',
    parameters: {
      additionalProperties: false,
      properties: {
        ids: {
          description: 'Ordered video ingredient ids to join (at least two)',
          items: { type: 'string' },
          minItems: 2,
          type: 'array',
        },
        isCaptionsEnabled: {
          description: 'Burn transcribed captions into the merged video',
          type: 'boolean',
        },
        isMuteVideoAudio: {
          description: 'Mute the original audio from the source clips',
          type: 'boolean',
        },
        isResizeEnabled: {
          description: 'Fit the joined video to portrait 1080×1920 after merge',
          type: 'boolean',
        },
        music: {
          description: 'Music ingredient id to lay under the merged video',
          type: 'string',
        },
        musicVolume: {
          description: 'Background music volume from 0 to 100',
          maximum: 100,
          minimum: 0,
          type: 'number',
        },
        transition: {
          description:
            'Transition between clips. Defaults to a cut when omitted',
          enum: [
            'none',
            'fade',
            'dissolve',
            'wipeleft',
            'wiperight',
            'wipeup',
            'wipedown',
            'circleopen',
            'circleclose',
            'slideleft',
            'slideright',
          ],
          type: 'string',
        },
        transitionDuration: {
          description: 'Transition length in seconds (0.1–2)',
          maximum: 2,
          minimum: 0.1,
          type: 'number',
        },
        transitionEaseCurve: {
          description: 'Ease curve for the transition between clips',
          enum: [
            'easyinoutexpo',
            'easyinexpooutcubic',
            'easyinquartoutquad',
            'easyinoutcubic',
            'easyinoutsine',
          ],
          type: 'string',
        },
      },
      required: ['ids'],
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
