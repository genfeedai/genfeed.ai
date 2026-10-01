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
];
